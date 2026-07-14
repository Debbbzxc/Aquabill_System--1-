const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const paymentSchema = new mongoose.Schema({
  receiptNumber:   { type: String, unique: true },
  referenceNumber: { type: String, unique: true, sparse: true }, // GCash/PayMaya transaction ref
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  bill: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bill',
    required: true,
  },
  amountPaid:  { type: Number, required: true },
  change:      { type: Number, default: 0 },
  paymentMode: {
    type: String,
    enum: ['Cash', 'GCash', 'PayMaya', 'Bank Transfer', 'Check'],
    default: 'Cash',
  },
  channel: {
    type: String,
    enum: ['Walk-in', 'Online'],
    default: 'Walk-in',
  },
  payerMobile: { type: String, trim: true }, // e-wallet mobile no. used for online payment
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Failed'],
    default: 'Completed',
  },
  paymentDate: { type: Date, default: Date.now },
  collectedBy: { type: String, trim: true },
  remarks:     { type: String, trim: true },
}, { timestamps: true });

paymentSchema.plugin(mongoosePaginate);

const REF_PREFIX = { GCash: 'GC', PayMaya: 'PM' };

paymentSchema.pre('save', async function (next) {
  if (!this.receiptNumber) {
    const now = new Date();
    const prefix = `REC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-`;

    const allPayments = await mongoose.model('Payment')
      .find({ receiptNumber: { $regex: '^REC-' } }, 'receiptNumber')
      .lean();

    let maxNum = 0;
    allPayments.forEach(p => {
      const parts = p.receiptNumber.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    this.receiptNumber = `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  }
  // Auto-generate a transaction reference number for e-wallet payments if one wasn't supplied
  if (!this.referenceNumber && REF_PREFIX[this.paymentMode]) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit
    this.referenceNumber = `${REF_PREFIX[this.paymentMode]}-${stamp}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
