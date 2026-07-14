const express = require('express');
const router = express.Router();
const hotelOgosController = require('../controllers/hotelOgosController');

// API Key authentication middleware
function checkApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing API key.',
    });
  }
  next();
}

// Protect all integration routes with API key
router.use(checkApiKey);

// GET /api/hotel-ogos/customer
router.get('/customer', hotelOgosController.getHotelOgosCustomer);

// GET /api/hotel-ogos/bills
router.get('/bills', hotelOgosController.getHotelOgosBills);

// POST /api/hotel-ogos/pay
router.post('/pay', hotelOgosController.payHotelOgosBill);

module.exports = router;
