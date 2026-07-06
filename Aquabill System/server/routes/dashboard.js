const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const [
      totalCustomers,
      activeCustomers,
      totalBills,
      unpaidBills,
      overdueBills,
      collectionThisMonth,
      collectionThisYear,
      recentPayments,
      monthlyCollections,
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ status: 'Active' }),
      Bill.countDocuments(),
      Bill.countDocuments({ status: { $in: ['Unpaid', 'Partial'] } }),
      Bill.countDocuments({ status: 'Overdue' }),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: startOfYear } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      Payment.find().sort({ paymentDate: -1 }).limit(5)
        .populate('customer', 'firstName lastName accountNumber')
        .populate('bill', 'billNumber'),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: startOfYear } } },
        {
          $group: {
            _id: { month: { $month: '$paymentDate' }, year: { $year: '$paymentDate' } },
            total: { $sum: '$amountPaid' },
            count: { $sum: 1 },
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    // Outstanding receivables
    const outstanding = await Bill.aggregate([
      { $match: { status: { $in: ['Unpaid', 'Partial', 'Overdue'] } } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        totalBills,
        unpaidBills,
        overdueBills,
        collectedThisMonth: collectionThisMonth[0]?.total || 0,
        collectedThisYear:  collectionThisYear[0]?.total  || 0,
        totalOutstanding:   outstanding[0]?.total || 0,
        year: now.getFullYear(),
        recentPayments,
        monthlyCollections: monthlyCollections.map(m => ({
          month: m._id.month,
          year: m._id.year,
          total: m.total,
          count: m.count,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
