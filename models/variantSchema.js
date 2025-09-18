const mongoose = require("mongoose");
const {Schema} = mongoose;

const variantSchema = new Schema({
    productId : {
        type : Schema.Types.ObjectId,
        ref : "Product",
        required : true
    },
    size : {
        type : String,
        required : true
    },
    colour : {
        type : String,
        required : true
    },
    stock : {
        type : Number,
        required : true
    },
    productImage : {
        type : [String],
        validate: [arr => arr.length >= 3, "At least 3 images required"]
    },
    basePrice : {
        type : Number,
        required : true
    },
    salePrice : {
        type : Number,
        required : true
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})


const Variant = mongoose.model("Variant",variantSchema);
module.exports = Variant;