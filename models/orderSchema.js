const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderedItems: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variant: {
          type: Schema.Types.ObjectId,
          ref: "Variant", // if using variants
        },

        // Snapshots for reliability
        productName: String,
        image: [String],
        size: String,
        color: String,

        basePrice: { type: Number, required: true },  // Original price
        salePrice: { type: Number, required: true },  // Discounted price at order time
        quantity: { type: Number, required: true },

        total: { type: Number, required: true }, // salePrice * quantity

        status: {
          type: String,
          enum: [
            "Ordered",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Order Not Placed",
            "Return Requested",
            "Returned",
          ],
          default: "Ordered",
        },
        cancelReason: {
          type: String,
          default: "",
        },
        returnReason: {
          type: String,
          default: "",
        },
        deliveredOn: {
          type: Date,
        }
      },
    ],
    totalPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    // Store snapshot of address (not just ref)
    shippingAddress: {
      name: String,
      phone: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,

    },

    paymentMethod: {
      type: String,
      enum: ["COD", "Razorpay", "Wallet"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Ordered",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Order Not Placed",
        "Return Request",
        "Returned",
      ],
      default: "Pending",
    },
    cancelReason: {
      type: String,
      default: "",
    },

    statusHistory: [
      {
        status: String,
        date: { type: Date, default: Date.now },
      },
    ],

    deliveredAt: Date,
    cancelledAt: Date,
    invoiceDate: Date,

    couponApplied: { type: Boolean, default: false },
    couponCode: { type: String, default: "" },
    couponDiscount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 10 },
    shippingFee: { type: Number, default: 0 },

  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
