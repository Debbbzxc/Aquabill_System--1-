const axios = require("axios");
const mongoose = require("mongoose");
const Customer = require("./models/Customer");
const Bill = require("./models/Bill");
const Payment = require("./models/Payment");

const notifyAdmin = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn("notifyAdmin: Database not connected yet, skipping notification.");
      return;
    }

    // 1. Fetch Summary Data (matching server/routes/external.js `/summary` logic)
    const [
      totalCustomers,
      totalBills,
      totalPayments,
      unpaidBills,
      partialBills,
      paidBills,
      overdueBills,
      revenueResult,
      outstandingResult,
      topBarangays,
    ] = await Promise.all([
      Customer.countDocuments(),
      Bill.countDocuments(),
      Payment.countDocuments(),

      Bill.countDocuments({ status: "Unpaid" }),
      Bill.countDocuments({ status: "Partial" }),
      Bill.countDocuments({ status: "Paid" }),
      Bill.countDocuments({ status: "Overdue" }),

      Payment.aggregate([
        { $match: { status: "Completed" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$amountPaid" },
          },
        },
      ]),

      Bill.aggregate([
        {
          $match: {
            status: { $in: ["Unpaid", "Partial", "Overdue"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$balance" },
          },
        },
      ]),

      Customer.aggregate([
        {
          $group: {
            _id: "$barangay",
            totalCustomers: { $sum: 1 },
          },
        },
        { $sort: { totalCustomers: -1 } },
        { $limit: 3 },
      ]),
    ]);

    const summary = {
      totalCustomers,
      totalBills,
      totalPayments,
      totalRevenue: revenueResult[0]?.total || 0,
      totalOutstanding: outstandingResult[0]?.total || 0,
      billsByStatus: {
        unpaid: unpaidBills,
        partial: partialBills,
        paid: paidBills,
        overdue: overdueBills,
      },
      topBarangays: topBarangays.map((b) => ({
        name: b._id,
        totalCustomers: b.totalCustomers,
      })),
    };

    // 2. Fetch Transactions Data (matching server/routes/external.js `/transactions` logic)
    const [payments, bills] = await Promise.all([
      Payment.find()
        .populate("customer", "firstName lastName accountNumber")
        .populate("bill", "billNumber status balance totalAmount")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Bill.find()
        .populate("customer", "firstName lastName accountNumber")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    const combined = [
      ...payments.map((p) => ({
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
      })),
      ...bills.map((b) => ({
        _id: b._id,
        type: "bill",
        receiptNumber: null,
        customerName: b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : null,
        accountNumber: b.customer?.accountNumber || null,
        amount: b.totalAmount,
        paymentMode: null,
        channel: null,
        status: b.status,
        billNumber: b.billNumber,
        balance: b.balance,
        totalAmount: b.totalAmount,
        createdAt: b.createdAt || b.readingDate,
      })),
    ];

    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const transactions = combined.slice(0, 50);

    // Send payload to external admin URL
    await axios.post(`${process.env.ADMIN_URL}/api/notify`, {
      system: "utilitybilling",
      summary,
      transactions,
    });
  } catch (err) {
    console.error("Failed to send notification:", err.message);
  }
};

module.exports = notifyAdmin;