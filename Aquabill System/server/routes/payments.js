const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
const Payment = require('../models/Payment');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const notifyAdmin = require('../notifyAdmin');

// GET all payments
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const query = {};
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { paymentDate: -1 },
      populate: [
        { path: 'customer', select: 'firstName lastName accountNumber' },
        { path: 'bill', select: 'billNumber totalAmount' },
      ],
    };

    if (search) {
      const customers = await Customer.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName:  { $regex: search, $options: 'i' } },
          { accountNumber: { $regex: search, $options: 'i' } },
        ]
      }).select('_id');
      query.customer = { $in: customers.map(c => c._id) };
    }

    const result = await Payment.paginate(query, options);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single payment (for receipt view/reprint)
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('customer', 'firstName lastName accountNumber address barangay')
      .populate({ path: 'bill', select: 'billNumber billingPeriod totalAmount balance' });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST record payment
router.post('/', async (req, res) => {
  try {
    const { bill: billId, amountPaid, paymentMethod, paymentDate, receivedBy, notes, referenceNumber } = req.body;

    const bill = await Bill.findById(billId).populate('customer');
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (bill.status === 'Paid') return res.status(400).json({ success: false, message: 'Bill is already paid' });

    const paid = parseFloat(amountPaid);
    if (isNaN(paid) || paid <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be a positive number.' });
    }
    const change = Math.max(0, paid - bill.balance);
    const actualPaid = Math.min(paid, bill.balance);

    const payment = new Payment({
      customer: bill.customer._id,
      bill: billId,
      amountPaid: paid,
      change,
      paymentMode: paymentMethod,
      channel: 'Walk-in',
      referenceNumber: referenceNumber ? referenceNumber.trim() : undefined,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      collectedBy: receivedBy,
      remarks: notes,
    });
    await payment.save();

    // Update bill
    bill.amountPaid += actualPaid;
    bill.balance     = Math.max(0, bill.totalAmount - bill.amountPaid);
    bill.status      = bill.balance <= 0 ? 'Paid' : 'Partial';
    if (bill.status === 'Paid') bill.paidDate = new Date();
    await bill.save();

    // Update customer balance
    const customer = await Customer.findById(bill.customer._id);
    customer.outstandingBalance = Math.max(0, customer.outstandingBalance - actualPaid);
    await customer.save();

    await payment.populate([
      { path: 'customer', select: 'firstName lastName accountNumber' },
      { path: 'bill', select: 'billNumber totalAmount billingPeriod' },
    ]);

    notifyAdmin();
    res.status(201).json({ success: true, data: payment, change, message: 'Payment recorded successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
