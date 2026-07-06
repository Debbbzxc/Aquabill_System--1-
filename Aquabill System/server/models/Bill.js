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

// Auto-generate bill number
billSchema.pre('save', async function (next) {
  if (!this.billNumber) {
    const count = await mongoose.model('Bill').countDocuments();
    const now = new Date();
    this.billNumber = `BILL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${String(count + 1).padStart(4,'0')}`;
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);
