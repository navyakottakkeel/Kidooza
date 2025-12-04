const Wallet = require("../../models/walletSchema");
const User = require('../../models/userSchema');
const HTTP_STATUS = require("../../constants/httpStatus");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// ----------------- RAZORPAY INITIALIZE -----------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// -------------------------- Get Wallet Page --------------------------------------------

const getWalletPage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    let user = req.user || (await User.findById(req.session.user));
    res.locals.user = user;

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    const paginatedTransactions = wallet.transactions
      .slice()        // copy
      .reverse()      // latest first
      .slice(skip, skip + limit);

      const responseData = {
        wallet,
        transactions: paginatedTransactions,
        currentPage: page,
        totalPages,
      }

    return res.status(HTTP_STATUS.OK).render("wallet", responseData);
  } catch (error) {
    next(error);
  }
};

// ---------------------- CREATE RAZORPAY ORDER ------------------------------

const createOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: amount * 100,  // Razorpay accepts paise
      currency: "INR",
      receipt: "wallet_topup_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    const responseData = {
      success: true,
      orderId: order.id,
      amount: order.amount,
      key: process.env.RAZORPAY_KEY_ID,
    }

    return res.json(responseData);

  } catch (error) {
    console.log(error);
    return res.json({ success: false });
  }
};

// ---------------------- VERIFY PAYMENT AND ADD MONEY ------------------------------

const verifyPayment = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    const { orderId, paymentId, signature, amount } = req.body;

    const body = orderId + "|" + paymentId;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.json({ success: false, message: "Invalid signature" });
    }

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    // Add balance & log transaction
    wallet.balance += Number(amount);
    wallet.transactions.push({
      type: "credit",
      amount: Number(amount),
      reason: "Wallet Top-Up (Razorpay)",
      date: new Date()
    });

    await wallet.save();

    return res.json({ success: true });

  } catch (error) {
    console.log(error);
    return res.json({ success: false });
  }
};

// -------------------------- Deduct Money (orders) --------------------------------------------

const deductMoney = async (userId, amount, reason) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    if (wallet.balance < amount) {
      return {
        success: false,
        message: "Insufficient wallet balance"
      };
    }

    wallet.balance -= amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      reason
    });

    await wallet.save();
    return { success: true, wallet };

  } catch (error) {
    throw error;
  }
};

// -------------------------- Credit Money (refund/cancel) --------------------------------------------

const creditMoney = async (userId, amount, reason) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      reason
    });

    await wallet.save();
    return wallet;
  } catch (error) {
    throw error;
  }
};

// -------------------------- Exports --------------------------------------------

module.exports = {
  getWalletPage,
  createOrder,
  verifyPayment,
  deductMoney,
  creditMoney
};
