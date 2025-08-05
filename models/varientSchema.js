const mongoose = require("mongoose");
const {Schema} = mongoose;

const varientSchema = new Schema({
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
    createdAt : {
        type : Date,
        default : Date.now
    }
})


const Varient = mongoose.model("Varient",varientSchema);
module.exports = Varient;