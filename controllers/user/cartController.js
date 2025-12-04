const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const HTTP_STATUS = require('../../constants/httpStatus');


const MAX_QTY_PER_PRODUCT = 5;

// -------------------------- ADD TO CART --------------------------------------------

const addToCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Not logged in" });
    }

    const { productId, variantId, quantity, saleValue, baseValue, discount } = req.body;

    const product = await Product.findById(productId).populate("category");
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Product not found" });
    }

    if (product.isBlock || product.category?.isDeleted) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Product not available for purchase" });
    }

    let stockAvailable = 0;
    if (variantId) {
      const variant = await Variant.findById(variantId);
      if (!variant) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Variant not found" });
      }
      stockAvailable = variant.stock;
    } else {
      stockAvailable = product.stock || 0;
    }

    if (stockAvailable <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Out of stock" });
    }
    if (quantity > stockAvailable) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: `Only ${stockAvailable} left in stock` });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existingItemIndex = cart.items.findIndex(
      (i) => i.productId.equals(productId) && (!variantId || i.variantId?.equals(variantId))
    );

    if (existingItemIndex > -1) {
      const newQty = cart.items[existingItemIndex].quantity + quantity;
      if (newQty > MAX_QTY_PER_PRODUCT) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: `Maximum ${MAX_QTY_PER_PRODUCT} per product`,
        });
      }
      if (newQty > stockAvailable) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: `Only ${stockAvailable} left in stock` });
      }

      cart.items[existingItemIndex].quantity = newQty;
      cart.items[existingItemIndex].basePrice = baseValue;
      cart.items[existingItemIndex].salePrice = saleValue;
      cart.items[existingItemIndex].discount = discount;
      cart.items[existingItemIndex].total = newQty * saleValue;
    } else {
      if (quantity > MAX_QTY_PER_PRODUCT) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: `Maximum ${MAX_QTY_PER_PRODUCT} per product`,
        });
      }

      cart.items.push({
        productId,
        variantId: variantId || null,
        quantity,
        basePrice: baseValue,
        salePrice: saleValue,
        discount,
        total: saleValue * quantity
      });
    }

    await Wishlist.updateOne(
      { userId },
      { $pull: { items: { productId, variantId: variantId || null } } }
    );

    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.total, 0);

    await cart.save();

    res.status(HTTP_STATUS.OK).json({ message: "Added to cart", cart, removedFromWishlist: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------- GET CART PAGE ------------------------------------------

const getCartPage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    const user = req.user || (req.session.user ? await User.findById(req.session.user) : null);

    const cart = await Cart.findOne({ userId })
      .populate({ path: "items.productId", select: "_id productName description" })
      .populate({ path: "items.variantId", select: "_id productImage size stock" })
      .lean();

    res.locals.user = user;

    if (!cart || cart.items.length === 0) {
      return res.render("cart", {
        cartItems: [],
        totalItemPrice: 0,
        itemDiscount: 0,
        platformFee: 0,
        shippingFee: 0,
        total: 0,
        totalItems: 0,
        soldOutItems: 0
      });
    }

    cart.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let totalItemPrice = 0;
    let itemDiscount = 0;
    let totalItems = 0;
    let soldOutItems = 0;

    const cartItems = cart.items.map(item => {
      const basePrice = item.basePrice || 0;
      const salePrice = item.salePrice || basePrice;
      const discount = item.discount || 0;
      const stock = item.variantId?.stock ?? 0;
      const isSoldOut = stock <= 0;

      if (isSoldOut) {
        soldOutItems++;
      } else {
        totalItemPrice += basePrice * item.quantity;
        if (basePrice > salePrice) {
          itemDiscount += (basePrice - salePrice) * item.quantity;
        }
        totalItems += item.quantity;
      }

      return {
        productId: item.productId?._id,
        variantId: item.variantId?._id || null,
        quantity: item.quantity,
        name: item.productId?.productName || "",
        description: item.productId?.description || "",
        image: item.variantId?.productImage?.[0] || "/img/1.jpg",
        basePrice,
        salePrice,
        discount,
        size: item.variantId?.size || "",
        stock,
        isSoldOut
      };
    });

    const platformFee = 10;
    const shippingFee = totalItemPrice > 599 ? 0 : 30;
    const total = totalItemPrice - itemDiscount + platformFee + shippingFee;

    const responseData = {
      cartItems,
      totalItemPrice,
      itemDiscount,
      platformFee,
      shippingFee,
      total,
      totalItems,
      soldOutItems
    }

    res.render("cart", responseData);
  } catch (error) {
    next(error);
  }
};

// ------------------------------ UPDATE QUANTITY -----------------------------------

const updateQuantity = async (req, res, next) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.user ? req.user._id : req.session.user;

    const parsedQty = parseInt(quantity);
    if (parsedQty <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid quantity" });
    }

    let stockAvailable;
    let price;

    if (variantId && variantId.trim() !== '') {
      const variant = await Variant.findById(variantId);
      if (!variant) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Variant not found" });
      }
      stockAvailable = variant.stock;
      price = variant.salePrice;
    } else {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product not found" });
      }
      stockAvailable = 0;
      price = product.salePrice;
    }

    if (parsedQty > stockAvailable) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Only ${stockAvailable} left in stock` });
    }
    if (parsedQty > MAX_QTY_PER_PRODUCT) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Maximum ${MAX_QTY_PER_PRODUCT} allowed per product` });
    }

    const filter = variantId && variantId.trim() !== ''
      ? { userId, "items.productId": productId, "items.variantId": variantId }
      : { userId, "items.productId": productId, "items.variantId": null };

    await Cart.updateOne(filter, {
      $set: {
        "items.$.quantity": parsedQty,
        "items.$.total": parsedQty * price
      }
    });

    const cart = await Cart.findOne({ userId });
    const cartItem = cart.items.find(i =>
      i.productId.equals(productId) &&
      ((variantId && i.variantId?.equals(variantId)) || (!variantId && !i.variantId))
    );

    if (!cartItem) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not in cart" });
    }

    cartItem.quantity = parsedQty;
    cartItem.total = parsedQty * cartItem.salePrice;

    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.totalPrice = cart.items.reduce((sum, i) => sum + i.total, 0);

    await cart.save();

    res.status(HTTP_STATUS.OK).json({ success: true, message: "Quantity updated", cart });
  } catch (error) {
    next(error);
  }
};

// ------------------------------ REMOVE FROM CART ----------------------------------------

const removeFromCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    let { productId, variantId } = req.params;
    variantId = variantId && variantId.trim() !== '' ? variantId : null;

    await Cart.updateOne({ userId }, { $pull: { items: { productId, variantId } } });

    const cart = await Cart.findOne({ userId });
    if (cart && cart.items.length > 0) {
      cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      await cart.save();
    } else {
      await Cart.updateOne({ userId }, { $set: { totalItems: 0 } });
    }

    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
};

// ------------------------------ VALIDATE CART ----------------------------------------

const validateCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .populate("items.variantId");

    if (!cart || cart.items.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Your cart is empty" });
    }

    for (let item of cart.items) {
      if (item.productId.isBlock) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: `${item.productId.productName} is unavailable`
        });
      }

      const stock = item.variantId ? item.variantId.stock : 0;
      if (stock < item.quantity) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: `${item.productId.productName} (${item.variantId?.size || "default"}) is out of stock`
        });
      }
    }

    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ------------------------------ Exports ----------------------------------------

module.exports = {
    addToCart,
    getCartPage,
    updateQuantity,
    removeFromCart,
    validateCart
}