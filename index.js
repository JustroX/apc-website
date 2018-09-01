var app = require('express')();
var bodyParser  = require("body-parser");
var urlencodedParser = bodyParser.urlencoded({extended: true});
var fs = require('fs');
var pth = require('path')


app.use(urlencodedParser);
app.use(bodyParser.json());
app.set('view engine','ejs');



//to fetch dependencies
app.get('/res/*',function(req,res){
	// console.log(req.originalUrl);
	var path = req.originalUrl.substr(4,req.originalUrl.length-4);
	res.sendFile(pth.join(__dirname,"/bower_components/",path));
});

app.get('/script.js',function(req,res){
	// console.log(req.originalUrl);
	res.sendFile(pth.join(__dirname,"/script.js"));
});

app.get('/pages/*',function(req,res){
	// console.log(req.originalUrl);
	var path = req.originalUrl.substr(6,req.originalUrl.length-4);
	res.render("pages/"+path);
});

app.get('/',function(req,res){
	// console.log(req.originalUrl);
	var path = req.originalUrl.substr(0,req.originalUrl.length-4);
	res.render("pages/index");
});





app.listen(5000 , (err)=> {
	console.log("We are at port 5000");
} );
