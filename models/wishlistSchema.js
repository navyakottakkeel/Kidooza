// models/wishlistSchema.js
const mongoose = require("mongoose");

const wishlistItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  colour: {
    type: String,
    required: true, // because Boys page always shows colour
  },
  createdAt: { type: Date, default: Date.now } // ✅ Track when added
});

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [wishlistItemSchema],

});

module.exports = mongoose.model("Wishlist", wishlistSchema);
