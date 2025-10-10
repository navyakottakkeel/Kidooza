const mongoose = require("mongoose");
const { Schema } = mongoose;

const offerSchema = new Schema({
  type: {
    type: String,
    enum: ["Product", "Category"],
    required: true,
  },
  productId: { type: Schema.Types.ObjectId, ref: "Product" },   // For Product Offer
  categoryId: { type: Schema.Types.ObjectId, ref: "Category" }, // For Category Offer
  discountPercentage: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Offer", offerSchema);
