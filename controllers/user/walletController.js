const Wallet = require("../../models/walletSchema");
const User = require('../../models/userSchema');


// ✅ Get Wallet Page
const getWalletPage = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    let user = null;
    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }

    res.locals.user = user;

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
      await wallet.save();
    }

    res.render("wallet", { wallet });
  } catch (err) {
    console.error("Error fetching wallet:", err);
    res.status(500).send("Internal Server Error");
  }
};


// ✅ Add Money to Wallet (for testing/demo purpose)
const addMoney = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { amount } = req.body;

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
    }

    wallet.balance += Number(amount);
    wallet.transactions.push({
      type: "credit",
      amount,
      reason: "Manual Top-up",
    });

    await wallet.save();
    res.redirect("/wallet");
  } catch (err) {
    console.error("Error adding money:", err);
    res.status(500).send("Internal Server Error");
  }
};

// ✅ Deduct Money (on order, cancel, etc.)
const deductMoney = async (userId, amount, reason) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0 });
  }

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  wallet.balance -= amount;
  wallet.transactions.push({
    type: "debit",
    amount,
    reason,
  });

  await wallet.save();
  return wallet;
};

// ✅ Credit Money (on refund/return/cancel)
const creditMoney = async (userId, amount, reason) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0 });
  }

  wallet.balance += amount;
  wallet.transactions.push({
    type: "credit",
    amount,
    reason,
  });

  await wallet.save();
  return wallet;
};

module.exports = {
     getWalletPage, 
     addMoney, 
     deductMoney, 
     creditMoney 
    };
