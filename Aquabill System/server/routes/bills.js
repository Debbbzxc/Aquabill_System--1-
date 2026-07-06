const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');

// Calculate bill amount based on consumption
function calculateBill(consumption, previousBalance = 0) {
  const RATE_FIRST_10 = parseFloat(process.env.RATE_FIRST_10) || 15.00;
  const RATE_NEXT_20  = parseFloat(process.env.RATE_NEXT_20)  || 20.00;
  const RATE_ABOVE_30 = parseFloat(process.env.RATE_ABOVE_30) || 25.00;
  const ENVIRONMENT_FEE = 10.00;
  const MAINTENANCE_FEE = 50.00;

  let waterCharge = 0;
  const breakdown = {
    first10: { units: 0, rate: RATE_FIRST_10, amount: 0 },
    next20:  { units: 0, rate: RATE_NEXT_20,  amount: 0 },
    above30: { units: 0, rate: RATE_ABOVE_30, amount: 0 },
  };

  if (consumption <= 10) {
    breakdown.first10.units = consumption;
  } else if (consumption <= 30) {
    breakdown.first10.units = 10;
    breakdown.next20.units  = consumption - 10;
  } else {
    breakdown.first10.units = 10;
    breakdown.next20.units  = 20;
    breakdown.above30.units = consumption - 30;
  }

  breakdown.first10.amount = breakdown.first10.units * RATE_FIRST_10;
  breakdown.next20.amount  = breakdown.next20.units  * RATE_NEXT_20;
  breakdown.above30.amount = breakdown.above30.units * RATE_ABOVE_30;

  waterCharge = breakdown.first10.amount + breakdown.next20.amount + breakdown.above30.amount;
  const totalAmount = waterCharge + ENVIRONMENT_FEE + MAINTENANCE_FEE + previousBalance;

  return { breakdown, waterCharge, environmentFee: ENVIRONMENT_FEE, maintenanceFee: MAINTENANCE_FEE, totalAmount };
}

// GET all bills
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status, month, year } = req.query;
    const query = {};
    if (status) query.status = status;
    if (month)  query['billingPeriod.month'] = parseInt(month);
    if (year)   query['billingPeriod.year']  = parseInt(year);

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: { path: 'customer', select: 'firstName lastName accountNumber address' },
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

    const result = await Bill.paginate(query, options);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single bill
router.get('/:id', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate('customer');
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create bill (meter reading)
router.post('/', async (req, res) => {
  try {
    const { customerId, currentReading, billingMonth, billingYear, dueDate, remarks } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const previousReading = customer.currentReading || 0;
    const consumption = Math.max(0, currentReading - previousReading);
    const previousBalance = customer.outstandingBalance || 0;

    const { breakdown, waterCharge, environmentFee, maintenanceFee, totalAmount } = calculateBill(consumption, previousBalance);

    const bill = new Bill({
      customer: customerId,
      billingPeriod: { month: billingMonth, year: billingYear },
      previousReading,
      currentReading,
      consumption,
      rateBreakdown: breakdown,
      waterCharge,
      environmentFee,
      maintenanceFee,
      previousBalance,
      totalAmount,
      balance: totalAmount,
      dueDate: new Date(dueDate),
      remarks,
    });

    await bill.save();

    // Update customer reading
    customer.previousReading = previousReading;
    customer.currentReading  = currentReading;
    customer.outstandingBalance = totalAmount;
    await customer.save();

    await bill.populate('customer');
    res.status(201).json({ success: true, data: bill, message: 'Bill created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update bill status / overdue
router.put('/:id/overdue', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (bill.status === 'Unpaid' && new Date() > bill.dueDate) {
      const penalty = bill.totalAmount * 0.02;
      bill.penaltyAmount = penalty;
      bill.totalAmount   += penalty;
      bill.balance       = bill.totalAmount - bill.amountPaid;
      bill.status        = 'Overdue';
      await bill.save();
    }
    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET calculate preview
router.post('/calculate', async (req, res) => {
  try {
    const { customerId, currentReading } = req.body;
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const previousReading = customer.currentReading || 0;
    const consumption = Math.max(0, currentReading - previousReading);
    const previousBalance = customer.outstandingBalance || 0;
    const result = calculateBill(consumption, previousBalance);

    res.json({ success: true, data: { ...result, consumption, previousReading, previousBalance } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
