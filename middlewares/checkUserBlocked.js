// middlewares/checkUserBlocked.js
const User = require("../models/userSchema");

const checkUserBlocked = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    if (!userId) return next();

    const user = await User.findById(userId);
    if (!user) {
      req.session.destroy();
      return res.redirect("/login");
    }

    if (user.isBlocked) {
      return req.session.destroy(() => {
        res.redirect("/login?blocked=true");
      });
    }

    next();
  } catch (error) {
    console.error("Block check error:", error);
    next(error);
  }
};

module.exports = checkUserBlocked;
 