const express = require('express');
const router = express.Router();
const checkAndApplyPenalties = require('../utils/overdueChecker');
const notifyAdmin = require('../notifyAdmin');

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
    const summary = await notifyAdmin.fetchSummaryData();
    res.json({
      success: true,
      data: summary,
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
    const transactions = await notifyAdmin.fetchTransactionsData();
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