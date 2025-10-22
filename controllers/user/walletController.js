const Wallet = require("../../models/walletSchema");
const User = require('../../models/userSchema');
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------------- Get Wallet Page --------------------------------------------

const getWalletPage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    let user = req.user || (await User.findById(req.session.user));
    res.locals.user = user;

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    return res.status(HTTP_STATUS.OK).render("wallet", { wallet });
  } catch (error) {
    next(error);
  }
};

// ----------------------Add Money to Wallet (for testing/demo purpose) ------------------------------

const addMoney = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Invalid amount" });
    }

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    wallet.balance += Number(amount);
    wallet.transactions.push({
      type: "credit",
      amount: Number(amount),
      reason: "Manual Top-up",
    });

    await wallet.save();

    return res.status(HTTP_STATUS.OK).redirect("/wallet");
  } catch (error) {
    next(error);
  }
};

// -------------------------- Deduct Money (on order, cancel, etc.) --------------------------------------------

const deductMoney = async (userId, amount, reason) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    if (wallet.balance < amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Insufficient wallet balance'
    });

    }

    wallet.balance -= amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      reason,
    });

    await wallet.save();
    return wallet;
  } catch (error) {
    throw error;
  }
};

// -------------------------- Credit Money (on refund/return/cancel) --------------------------------------------

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
      reason,
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
     addMoney, 
     deductMoney, 
     creditMoney 
    };
