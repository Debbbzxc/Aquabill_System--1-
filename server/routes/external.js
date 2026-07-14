  const express = require('express');
  const router = express.Router();
  const Customer = require('../models/Customer');
  const Bill = require('../models/Bill');
  const Payment = require('../models/Payment');
  const checkAndApplyPenalties = require('../utils/overdueChecker');

  // API key check — protects both routes below
  function checkApiKey(req, res, next) {
    if (req.headers['x-api-key'] !== process.env.INTERNAL_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }
    next();
  }

  router.use(checkApiKey);

  
  // SUMMARY ROUTE — GET /api/external/summary
 
  router.get('/summary', async (req, res) => {
    try {
      await checkAndApplyPenalties();
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

        Bill.countDocuments({ status: 'Unpaid' }),
        Bill.countDocuments({ status: 'Partial' }),
        Bill.countDocuments({ status: 'Paid' }),
        Bill.countDocuments({ status: 'Overdue' }),

        Payment.aggregate([
          { $match: { status: 'Completed' } },
          {
            $group: {
              _id: null,
              total: { $sum: '$amountPaid' },
            },
          },
        ]),

        Bill.aggregate([
          {
            $match: {
              status: { $in: ['Unpaid', 'Partial', 'Overdue'] },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$balance' },
            },
          },
        ]),

        Customer.aggregate([
          {
            $group: {
              _id: '$barangay',
              totalCustomers: { $sum: 1 },
            },
          },
          { $sort: { totalCustomers: -1 } },
          { $limit: 3 },
        ]),
      ]);

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // TRANSACTIONS ROUTE — GET /api/external/transactions
  
  router.get('/transactions', async (req, res) => {
    try {
      await checkAndApplyPenalties();
      const [payments, bills] = await Promise.all([
        Payment.find()
          .populate('customer', 'firstName lastName accountNumber')
          .populate('bill', 'billNumber status balance totalAmount')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
        Bill.find()
          .populate('customer', 'firstName lastName accountNumber')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      ]);

      const combined = [
        ...payments.map(p => ({
          _id: p._id,
          type: 'payment',
          receiptNumber: p.receiptNumber,
          customerName: p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : null,
          accountNumber: p.customer?.accountNumber || null,
          amount: p.amountPaid,
          paymentMode: p.paymentMode,
          channel: p.channel,
          status: p.bill?.status || 'Unknown',
          billNumber: p.bill?.billNumber || null,
          balance: p.bill?.balance || 0,
          totalAmount: p.bill?.totalAmount || 0,
          createdAt: p.createdAt || p.paymentDate,
        })),
        ...bills.map(b => ({
          _id: b._id,
          type: 'bill',
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
        }))
      ];

      combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const transactions = combined.slice(0, 50);

      res.json({
        success: true,
        data: transactions,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  module.exports = router;