const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const billSchema = new mongoose.Schema({
  billNumber: { type: String, unique: true },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  billingPeriod: {
    month: { type: Number, required: true },
    year:  { type: Number, required: true },
  },
  previousReading: { type: Number, required: true },
  currentReading:  { type: Number, required: true },
  consumption: { type: Number, required: true },

  // Rate breakdown
  rateBreakdown: {
    first10:  { units: Number, rate: Number, amount: Number },
    next20:   { units: Number, rate: Number, amount: Number },
    above30:  { units: Number, rate: Number, amount: Number },
  },

  waterCharge:    { type: Number, required: true },
  environmentFee: { type: Number, default: 0 },
  maintenanceFee: { type: Number, default: 0 },
  penaltyAmount:  { type: Number, default: 0 },
  previousBalance: { type: Number, default: 0 },
  totalAmount:    { type: Number, required: true },
  amountPaid:     { type: Number, default: 0 },
  balance:        { type: Number, default: 0 },

  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['Unpaid', 'Partial', 'Paid', 'Overdue'],
    default: 'Unpaid',
  },
  readingDate: { type: Date, default: Date.now },
  paidDate:    { type: Date },
  remarks:     { type: String, trim: true },
}, { timestamps: true });

billSchema.plugin(mongoosePaginate);

// Auto-generate bill number.
// Based on the HIGHEST existing bill number suffix (across all bills), not a
// simple count — this avoids collisions after a bill has been deleted, the
// same issue that was happening with Customer account numbers.
billSchema.pre('validate', async function (next) {
  if (!this.billNumber) {
    const now = new Date();
    const prefix = `BILL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;

    const allBills = await mongoose.model('Bill')
      .find({ billNumber: { $exists: true, $ne: null } }, 'billNumber')
      .lean();

    let maxNum = 0;
    allBills.forEach(b => {
      const parts = b.billNumber.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    this.billNumber = `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);