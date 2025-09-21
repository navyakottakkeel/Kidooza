const mongoose = require("mongoose");
const {Schema} = mongoose;

const couponSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
      },
      discountType: {
        type: String,
        enum: ["percentage", "fixed"],
        required: true
      },
      discountValue: {
        type: Number,
        required: true,
        min: 1
      },
      minPurchase: {
        type: Number,
        default: 0
      },
      expiryDate: {
        type: Date,
        required: true
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }, { timestamps: true });



const Coupon = mongoose.model("Coupon",couponSchema);
module.exports = Coupon;
