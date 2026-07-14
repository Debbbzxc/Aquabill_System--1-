const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);

const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const checkAndApplyPenalties = require('../utils/overdueChecker');

router.get('/summary', async (req, res) => {
  try {
    await checkAndApplyPenalties();
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const from = req.query.from ? new Date(req.query.from) : defaultFrom;
    const to = req.query.to ? new Date(new Date(req.query.to).setHours(23, 59, 59, 999)) : defaultTo;

    const [
      newCustomers,
      billsGenerated,
      billsByStatus,
      paymentsInRange,
      outstandingResult,
      topBarangays,
    ] = await Promise.all([
      Customer.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      Bill.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      Bill.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      Payment.find({ paymentDate: { $gte: from, $lte: to }, status: 'Completed' }).lean(),
      Bill.aggregate([
        { $match: { status: { $in: ['Unpaid', 'Partial', 'Overdue'] } } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: from, $lte: to }, status: 'Completed' } },
        { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'cust' } },
        { $unwind: '$cust' },
        { $group: { _id: '$cust.barangay', total: { $sum: '$amountPaid' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const totalCollected = paymentsInRange.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

    const paymentsByMode = {};
    paymentsInRange.forEach(p => {
      paymentsByMode[p.paymentMode] = (paymentsByMode[p.paymentMode] || 0) + p.amountPaid;
    });

    const totalBilled = billsByStatus.reduce((sum, b) => sum + b.total, 0);

    res.json({
      success: true,
      data: {
        period: { from, to },
        newCustomers,
        billsGenerated,
        totalBilled,
        totalCollected,
        totalOutstanding: outstandingResult[0]?.total || 0,
        paymentsCount: paymentsInRange.length,
        billsByStatus: billsByStatus.map(b => ({ status: b._id, count: b.count, total: b.total })),
        paymentsByMode,
        topBarangays: topBarangays.map(b => ({ name: b._id, total: b.total, count: b.count })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;    