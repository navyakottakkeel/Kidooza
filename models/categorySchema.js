const mongoose = require("mongoose");
const {Schema} = mongoose;


const categorySchema = new Schema({
    name : {
        type : String,
        required : true,
        unique : true
    },
    isDeleted : {
        type : Boolean,
        default : false
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})


const Category = mongoose.model("Category",categorySchema);
module.exports = Category;