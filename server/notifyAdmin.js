const axios = require("axios");
const mongoose = require("mongoose");
const Customer = require("./models/Customer");
const Bill = require("./models/Bill");
const Payment = require("./models/Payment");

const fetchSummaryData = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database not connected yet");
  }

  const [customerStats, billStats, paymentStats] = await Promise.all([
    Customer.aggregate([
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          topBarangays: [
            { $group: { _id: "$barangay", totalCustomers: { $sum: 1 } } },
            { $sort: { totalCustomers: -1 } },
            { $limit: 3 }
          ]
        }
      }
    ]),
    Bill.aggregate([
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          statusCounts: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          outstanding: [
            { $match: { status: { $in: ["Unpaid", "Partial", "Overdue"] } } },
            { $group: { _id: null, total: { $sum: "$balance" } } }
          ]
        }
      }
    ]),
    Payment.aggregate([
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          totalRevenue: [
            { $match: { status: "Completed" } },
            { $group: { _id: null, total: { $sum: "$amountPaid" } } }
          ]
        }
      }
    ])
  ]);

  const customerFacet = customerStats[0] || {};
  const billFacet = billStats[0] || {};
  const paymentFacet = paymentStats[0] || {};

  const totalCustomers = customerFacet.totalCount?.[0]?.count || 0;
  const totalBills = billFacet.totalCount?.[0]?.count || 0;
  const totalPayments = paymentFacet.totalCount?.[0]?.count || 0;

  const totalRevenue = paymentFacet.totalRevenue?.[0]?.total || 0;
  const totalOutstanding = billFacet.outstanding?.[0]?.total || 0;

  const billsByStatus = {
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0
  };

  const statusCounts = billFacet.statusCounts || [];
  statusCounts.forEach((item) => {
    if (item._id === "Unpaid") billsByStatus.unpaid = item.count;
    else if (item._id === "Partial") billsByStatus.partial = item.count;
    else if (item._id === "Paid") billsByStatus.paid = item.count;
    else if (item._id === "Overdue") billsByStatus.overdue = item.count;
  });

  const topBarangays = (customerFacet.topBarangays || []).map((b) => ({
    name: b._id,
    totalCustomers: b.totalCustomers,
  }));

  return {
    totalCustomers,
    totalBills,
    totalPayments,
    totalRevenue,
    totalOutstanding,
    billsByStatus,
    topBarangays
  };
};

const fetchTransactionsData = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database not connected yet");
  }

  const payments = await Payment.find()
    .populate("customer", "firstName lastName accountNumber")
    .populate("bill", "billNumber status balance totalAmount")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const combined = payments.map((p) => ({
    _id: p._id,
    type: "payment",
    receiptNumber: p.receiptNumber,
    customerName: p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : null,
    accountNumber: p.customer?.accountNumber || null,
    amount: p.amountPaid,
    paymentMode: p.paymentMode,
    channel: p.channel,
    status: p.bill?.status || "Unknown",
    billNumber: p.bill?.billNumber || null,
    balance: p.bill?.balance || 0,
    totalAmount: p.bill?.totalAmount || 0,
    createdAt: p.createdAt || p.paymentDate,
  }));

  combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return combined.slice(0, 50);
};

const notifyAdmin = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn("notifyAdmin: Database not connected yet, skipping notification.");
      return;
    }

    const [summary, transactions] = await Promise.all([
      fetchSummaryData(),
      fetchTransactionsData()
    ]);

    // Send payload to external admin URL
    await axios.post(`${process.env.ADMIN_URL}/api/notify`, {
      system: "utilitybilling2",
      summary,
      transactions,
    });
  } catch (err) {
    console.error("Failed to send notification:", err.message);
  }
};

notifyAdmin.fetchSummaryData = fetchSummaryData;
notifyAdmin.fetchTransactionsData = fetchTransactionsData;

module.exports = notifyAdmin;