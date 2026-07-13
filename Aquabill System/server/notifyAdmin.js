const axios = require("axios");

const notifyAdmin = async () => {
  try {
    await axios.post(`${process.env.ADMIN_URL}/api/notify`, {
      system: "utilitybilling",
    });
  } catch (err) {
    console.error("Failed to send notification:", err.message);
  }
};

module.exports = notifyAdmin;