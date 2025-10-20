const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const Cart = require('../../models/cartSchema');
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------------- Add To Wishlist --------------------------------------------

const addToWishlist = async (req, res, next) => {
  try {
    const { productId, colour } = req.body;
    const userId = req.user ? req.user._id : req.session.user;

    if (!productId || !colour) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Missing product or colour",
      });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        items: [{ productId, colour }],
      });
      await wishlist.save();

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        action: "added",
      });
    }

    const itemIndex = wishlist.items.findIndex(
      (item) =>
        item.productId.toString() === productId && item.colour === colour
    );

    if (itemIndex > -1) {
      wishlist.items.splice(itemIndex, 1);
      await wishlist.save();

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        action: "removed",
        wishlistCount: wishlist.items.length,
      });
    } else {
      wishlist.items.push({ productId, colour });
      await wishlist.save();

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        action: "added",
        wishlistCount: wishlist.items.length,
      });
    }
  } catch (err) {
    next(err);
  }
}; 

// -------------------------- Get Wishlist Page --------------------------------------------

const getWishlistPage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    if (!userId) return res.redirect("/login");

    const user = req.user || (await User.findById(req.session.user));
    res.locals.user = user;

    const wishlist = await Wishlist.findOne({ userId })
      .populate("items.productId")
      .lean();

    const sortedItems = (wishlist?.items || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Group items by productId
    const productMap = new Map();

    for (const item of sortedItems) {
      if (!item.productId) continue;
      const pid = item.productId._id.toString();

      if (!productMap.has(pid)) {
        productMap.set(pid, {
          _id: item.productId._id,
          name: item.productId.productName,
          description: item.productId.description,
          basePrice: item.productId.basePrice,
          salePrice: item.productId.salePrice,
          images: item.productId.images,
          category: item.productId.category,
          variantsByColour: [],
          wishlistedColours: [],
        });
      }
      productMap.get(pid).wishlistedColours.push(item.colour);
    }

    const products = Array.from(productMap.values());

    // Process each product (variants + offer)
    for (let product of products) {
      const variants = await Variant.find({ productId: product._id }).lean();
      const groupedByColour = {};

      variants.forEach((v) => {
        if (!groupedByColour[v.colour]) {
          groupedByColour[v.colour] = {
            colour: v.colour,
            image: v.productImage[0],
            sizes: [],
          };
        }

        groupedByColour[v.colour].sizes.push({
          id: v._id,
          size: v.size,
          stock: v.stock,
          image: v.productImage[0],
        });
      });

      product.variantsByColour = Object.values(groupedByColour);
      product.defaultImage = product.variantsByColour[0]?.image || null;

      // Apply offers
      const now = new Date();
      const basePrice = product.basePrice;

      const defaultDiscount = Math.round(
        ((basePrice - product.salePrice) / basePrice) * 100
      );

      const [productOffer, categoryOffer] = await Promise.all([
        Offer.findOne({
          type: "Product",
          productId: product._id,
          isActive: true,
          startDate: { $lte: now },
          endDate: { $gte: now },
        }),
        Offer.findOne({
          type: "Category",
          categoryId: product.category?._id || product.category,
          isActive: true,
          startDate: { $lte: now },
          endDate: { $gte: now },
        }),
      ]);

      const productDiscount = productOffer?.discountPercentage || 0;
      const categoryDiscount = categoryOffer?.discountPercentage || 0;

      const bestDiscount = Math.max(productDiscount, categoryDiscount);
      const finalDiscount = Math.round(defaultDiscount + bestDiscount);

      product.finalSalePrice =
        product.basePrice - (product.basePrice * finalDiscount) / 100;
      product.finalDiscount = finalDiscount;
    }

    const cartCount = await getCartCount(userId);

    return res.status(HTTP_STATUS.OK).render("wishlist", {
      wishlistProducts: products,
      user,
      cartCount,
      wishlistCount: products.length,
    });
  } catch (err) {
    next(err);
  }
};

//................helper function get cart count ........................................

async function getCartCount(userId) {
  if (!userId) return 0;
  const cart = await Cart.findOne({ userId });
  return cart ? cart.items.length : 0;
}

  
// -------------------------- Remove From Wishlist --------------------------------------------

const removeFromWishlist = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { productId } = req.params;

    await Wishlist.updateOne(
      { userId, "items.productId": productId },
      { $pull: { items: { productId } } }
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      action: "removed",
    });
  } catch (err) {
    next(err);
  }
};


// -------------------------- Toggle Wishlist --------------------------------------------

const toggleWishlist = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    if (!userId) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ success: false, loginRequired: true });
    }

    const { productId, colour } = req.body;
    if (!productId || !colour) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Missing product or colour" });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [{ productId, colour }] });
      await wishlist.save();
      return res.status(HTTP_STATUS.OK).json({ success: true, action: "added" });
    }

    const exists = wishlist.items.some(
      (item) =>
        item.productId.toString() === productId && item.colour === colour
    );

    if (exists) {
      await Wishlist.updateOne(
        { userId },
        { $pull: { items: { productId, colour } } }
      );
      return res.status(HTTP_STATUS.OK).json({ success: true, action: "removed" });
    } else {
      await Wishlist.updateOne(
        { userId },
        { $push: { items: { productId, colour } } }
      );
      return res.status(HTTP_STATUS.OK).json({ success: true, action: "added" });
    }
  } catch (err) {
    next(err);
  }
};


// -------------------------- Get Variants By Product --------------------------------------------

const getVariantsByProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const variants = await Variant.find({ productId: id }).lean();

    if (!variants || variants.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "No variants found",
      });
    }

    const groupedByColour = {};
    variants.forEach((v) => {
      if (!groupedByColour[v.colour]) groupedByColour[v.colour] = [];
      groupedByColour[v.colour].push({
        _id: v._id,
        size: v.size,
        stock: v.stock,
        image: v.productImage[0] || "",
      });
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      groupedByColour,
    });
  } catch (err) {
    next(err);
  }
};

// -------------------------- Exports --------------------------------------------

module.exports = {

    addToWishlist,
    getWishlistPage,
    removeFromWishlist,
    toggleWishlist,
    getVariantsByProduct
}