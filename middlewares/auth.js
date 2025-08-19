const User = require('../models/userSchema');
const Cart = require('../models/cartSchema');
const Wishlist = require('../models/wishlistSchema');


const adminAuth = (req, res, next) => {

    // Allow login page and error page without session
    if (req.path === '/login' || req.path === '/pageerror') {
        return next();
    }

    if (req.session.admin) {
        User.findById(req.session.admin)
            .then(data => {
                if (data && data.isAdmin) {
                    next();
                } else {
                    res.redirect('/admin/login');
                }
            })
            .catch(error => {
                console.log("Error in adminAuth middleware", error);
                res.status(500).send("Internal Server error");
            })
    } else {
        res.redirect('/admin/login');
    }
}


////////////////////////////////////////////////////////////////////////////


const userAuth = (req, res, next) => {

    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    res.redirect('/login');
                }
            })
            .catch(error => {
                console.log("Error in userauth middleware", error);
                res.status(500).send("Internal server error");
            })
    } else {
        res.redirect('/login');
    }
}


////////////////////////////////////////////////////////////////////


const cartCount = async (req, res, next) => {
  try {
    let userId = null;
    if (req.user) {
      userId = req.user._id;
    } else if (req.session.user) {
      userId = req.session.user;
    }

    if (userId) {
      const cart = await Cart.findOne({ userId });
      res.locals.cartCount = cart ? cart.items.length : 0;
    } else {
      res.locals.cartCount = 0;
    }
  } catch (err) {
    console.error("Cart count middleware error:", err);
    res.locals.cartCount = 0;
  }
  next();
};

////////////////////////////////////////////////////////////////////////////////////////

const wishlistCount = async (req, res, next) => {
    const userId = req.user ? req.user._id : req.session.user;
    if (userId) {
        try {
            const wishlist = await Wishlist.findOne({ userId });
            res.locals.wishlistCount = wishlist ? wishlist.items.length : 0;
        } catch (err) {
            res.locals.wishlistCount = 0;
        }
    } else {
        res.locals.wishlistCount = 0;
    }
    next();
};

//////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    adminAuth,
    userAuth,
    cartCount,
    wishlistCount
}