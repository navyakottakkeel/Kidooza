const mongoose = require("mongoose");
const {Schema} = mongoose;


const productSchema = new Schema({
    productName : {
        type : String,
        required : true
    },
    description : {
        type : String,
        required : true
    },
    brand : {
        type : String,
        required : true
    },
    category : {
        type : String, 
        required : true
    },
    regularPrice : {
        type : Number,
        required : true
    },
    salePrice : {
        type : Number,
        required : true
    },
    productOffer : {
        type : Number,
        default : 0
    },
    quantity : {
        type : Number,
        default : true
    },
    color : {
        type : String,
        required : true
    },
    productImage : {
        type : [String],
        required : true
    },
    isBlock : {
        type : Boolean,
        default : false
    },
    status : {
        type : String,
        enum : ["Available", "Out of stock"],
        required : true,
        default : "Available"
    }
},{timestamps : true})


const Product = mongoose.model("Product",productSchema);
module.exports = Product;