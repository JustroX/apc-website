var app = require('express')();
var bodyParser  = require("body-parser");
var urlencodedParser = bodyParser.urlencoded({extended: true});
var fs = require('fs');
var pth = require('path');
var jwt = require('./jwt-ee.js');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var SHA256 = require('crypto-js/SHA256');
var url = 'mongodb://localhost:27017/';
var db;

var settings = 
{
	secret: "5526B47F0B2B5B87AE1EB88FA1CAC63F84800F0019B56F6F80B68C0850B63CDC"
};

app.use(urlencodedParser);
app.use(bodyParser.json());
app.set('view engine','ejs');


MongoClient.connect(url , (err,dbo) =>{
	if(err) throw err;
	db = dbo.db('apc');
	console.log("Succesfully connected to APC database. ");	
});

//validation function
function validate(priv,req,res,f_)
{
	var token = req.body.token;
	var payload  = jwt.validate(token);
	if(payload)
	{
		db.collection('user').findOne({_id:ObjectId(payload._id)},(err,result)=>{
			if(err) return console.log(err);
			if(result)
			{
				if(result.priv.includes(priv))
					f_(result._id);
				else
					res.send({err:"PERMISSION_DENIED"});
			}
			else
			{
				res.send({err:"USER_NOT_FOUND"});
			}
		})
	}
	else
		res.send({err:"TOKEN_INTEGRITY_FAILED"});
}

//api
app.post('/api/auth',(req,res)=>{
	//authenticate
	let username = req.body.form.username;
		let password = req.body.form.password;

		password = SHA256(password + settings.secret).toString();

		db.collection('user').findOne({username:username,password:password},(err,result)=>{
			if(err) throw err;

			if(result)
			{
				delete result.password;
				console.log(result);
				//generate token
				var  token = jwt.new( result );
				res.send({ token : token });
			}
			else
				res.send({err:"AUTH_FAILED"});
		});
});

//User APIs
app.post('/api/user',(req,res)=>{
	validate("admin",req,res,(id)=>{
		db.collection('user').find({},{ projection:
			{
				_id:1, 
				username: 1,
				email: 1,
				priv : 1,
				name: 1, 
				secondary: 1
			} }
			).toArray((err, result)=>{
			if(err) throw err;
			res.send(result );
		});
	});
});
app.post('/api/user/exists/username',(req,res)=>{
	validate("admin",req,res,(id)=>{
		db.collection('user').findOne({username:req.body.username},(err,result)=>{
			if(err) throw err;
			res.send((result)? false : true );
		});
	})
});
app.post('/api/user/add',(req,res)=>{
	validate("admin",req,res,(id)=>{
		let form = req.body.form;
		db.collection('user').insertOne(
		{
			username: form.username,
			password: SHA256( form.password + settings.secret ).toString(),
			email : form.email,
			name : form.name,
			groups: [],
			modules: [],
			courses: [],
			priv: form.priv,
			secondary: form.secondary
		},
		(err,result)=>{
			if(err) throw err;
			res.send({mes: "User has been succesfully added."});
		});
	});
});
app.post('/api/user/edit',(req,res)=>{
	validate("admin",req,res,(id)=>{
		let form = req.body.form;

		if(form._id) delete form._id;
		if(form.password)
		{
			form.password  = SHA256(form.password + settings.secret).toString();
		}

		db.collection('user').updateOne({_id: ObjectId(req.body.id) },
		{
			$set : form,
		},
		(err,result)=>{
			if(err) throw err;
			console.log(result.result.nModified+" files updated. ");
			res.send({mes: "User information has been succesfully updated."});
		});
	});
});
app.post('/api/user/delete',(req,res)=>{
	validate("admin",req,res,(id)=>{
		let target = req.body.id;
		if(target==id)
		{
			res.send({mes: "You can not delete yourself"});
			return;
		}
		db.collection('user').deleteOne({_id:ObjectId(target)},(err,result)=>{
			if(err) throw err;
			res.send({mes: "User has been removed from the database."});
		});
	});
});


//Content APIs

const TIMELINE_SIZE = 5;
app.post('/api/content/',(req,res)=>{
	validate("user",req,res,(id)=>{
		//time
		let page = req.body.page;
		db.collection('content').find({ author: ObjectId(id) }).sort({ date : -1 }).skip(page*TIMELINE_SIZE).limit(TIMELINE_SIZE).toArray((err,result)=>{
			if(err) throw err;
			res.send(result);
		});
	});
});


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
