const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [
        {
            productId: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            variantId: {
                type: Schema.Types.ObjectId,
                ref: "Variant" 
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            basePrice: {          // ✅ original MRP
                type: Number,
                required: true
            },
            salePrice: {          // ✅ price after discount/offers
                type: Number,
                required: true
            },
            discount: {           // ✅ discount percentage
                type: Number,
                default: 0
            },
            total: {              // ✅ salePrice * quantity
                type: Number,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    totalPrice: {
        type: Number,
        default: 0
    },
    totalItems: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Cart", cartSchema);
