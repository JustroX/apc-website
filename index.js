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
				// console.log(result);
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
	let query = {};
	let ex = (id)=>
	{
		db.collection('user').find(
			query,
			{ 
				projection:
				{
					_id:1, 
					username: 1,
					email: 1,
					priv : 1,
					name: 1, 
					secondary: 1,
					followers: 1,
					following: 1,
				}
			}
			).toArray((err, result)=>{
			if(err) throw err;
			res.send(result);
		});
	}
	if(req.body.user) 
	{
		query = 
		{
			_id : ObjectId(req.body.user)
		}
		validate("user",req,res,ex);
	}
	else
		validate("admin",req,res,ex);

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
			// console.log(result.result.nModified+" files updated. ");
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



app.post('/api/content/new',(req,res)=>{
	validate('user',req,res,(id)=>{
		let upper_id = req.body.upper_id;

		let following = [];
		let groups = [];
		//get following
		db.collection('user').findOne({ _id : id },(err,result)=>{
			// if(!result)
			// 	return console.log(result);
			for(let i in result.following)
				following.push(ObjectId(result.following[i]));
			
			following.push(id);
			
			for(let i in result.groups)
				groups.push(result.groups[i]);

			db.collection('content')
					.aggregate(
					[
						{
							$match:
							{
								$or:
								[ 
									{ shares : { $in : following } },
									{ author : { $in :  following } },
									{ group  : { $in : groups } }  ,
								]
							}
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'author',
								foreignField: '_id',
								as: 'author'
							}
						},
						{
							$unwind: {path:"$replies", preserveNullAndEmptyArrays: true},
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'replies.author',
								foreignField: '_id',
								as: 'replies.author'
							}
						},
						{
							$unwind: {path:"$replies.author", preserveNullAndEmptyArrays: true},
						},
						{

					        $group: {
					            _id: "$_id",
					            author: { $first : "$author"},
					            value: { $first : "$value"},
					            date: { $first : "$date"},
					            group: { $first : "$group"},
					            likes: { $first : "$likes"},
					            shares: { $first : "$shares"},
					            origin: { $first : "$origin"},
					            replies: { $push : "$replies"}
					        }
						},
						{
							$project:
							{
								_id:1,
								author: 
								{
									_id: true,
									name: true,
								},
								value: true,
								date: true,
								group: true,
								likes: true,
								shares: true,
								replies: 
								{
									$cond:
									{
										if: { $eq : [ [{}] , "$replies"  ] },
										then : [],
										else:
										{
											$map:
											{
												input: "$replies",
												as : "reply",
												in : 
												{
													$cond:
													{
														if : { $eq : [ {} , "$$reply" ]  },
														then: "$REMOVE",
														else:
															{
																value : "$$reply.value",
																author :"$$reply.author.name",
																author_id : "$$reply.author._id",
																date: "$$reply.date",
															}
													}
												}
											}
										}

									}
								},
								origin: true,


							}
						},
						{
							$sort:
							{
								date : -1
							}
						},
					]).toArray(
				(err,result)=>
				{
					if(err) throw err;
					if(!result[0]) 
					{
						res.send({err:"Yey! You reached the end."});
						return;
					}
					let a = result.reduce((a,b,c)=> b._id==upper_id ? c : a );
					// console.log("index at "+ a );
					let upper = a >= 0 ? a :  result.length-1;

					let r = result.splice(0,upper);
					// console.log(JSON.stringify(r.length));
					res.send(( (r[0]) ?  r : {err: "Yey! You reached the end."}) );
					// res.send(result);
				}
			);

		

		});
	});
});
app.post('/api/content/old',(req,res)=>{
	validate('user',req,res,(id)=>{
		let lower_id = req.body.lower_id;
		let following = [];
		let groups = [];
		//get following
		db.collection('user').findOne({ _id : id },(err,result)=>{
			// if(!result)
			// 	return console.log(result);
			for(let i in result.following)
				following.push(ObjectId(result.following[i]));
			console.log(following)
			
			following.push(id);
			
			for(let i in result.groups)
				groups.push(result.groups[i]);


			db.collection('content')
					.aggregate(
					[
						{
							$match:
							{
								$or:
								[ 
									{ shares : { $in : following } },
									{ author : { $in :  following } , "origin.type": "profile" },
									{ 
										"origin.type" : "group",
										"origin.id" : { $in : groups }
									}  ,
								]
							}
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'author',
								foreignField: '_id',
								as: 'author'
							}
						},
						{
							$unwind: {path:"$replies", preserveNullAndEmptyArrays: true},
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'replies.author',
								foreignField: '_id',
								as: 'replies.author'
							}
						},
						{
							$lookup:
							{
								from: 'group',
								localField: 'origin.id',
								foreignField: '_id',
								as: 'origin.value'
							}
						},
						{
							$unwind: {path:"$replies.author", preserveNullAndEmptyArrays: true},
						},
						{

					        $group: {
					            _id: "$_id",
					            author: { $first : "$author"},
					            value: { $first : "$value"},
					            date: { $first : "$date"},
					            group: { $first : "$group"},
					            likes: { $first : "$likes"},
					            shares: { $first : "$shares"},
					            origin: { $first : "$origin"},
					            replies: { $push : "$replies"}
					        }
						},
						{
							$project:
							{
								_id:1,
								author: 
								{
									_id: true,
									name: true,
								},
								value: true,
								date: true,
								group: true,
								likes: true,
								shares: true,
								replies: 
								{
									$cond:
									{
										if: { $eq : [ [{}] , "$replies"  ] },
										then : [],
										else:
										{
											$map:
											{
												input: "$replies",
												as : "reply",
												in : 
												{
													$cond:
													{
														if : { $eq : [ {} , "$$reply" ]  },
														then: "$REMOVE",
														else:
															{
																value : "$$reply.value",
																author :"$$reply.author.name",
																author_id : "$$reply.author._id",
																date : "$$reply.date",
															}
													}
												}
											}
										}

									}
								},
								origin: true,


							}
						},
						{
							$sort:
							{
								date : -1
							}
						},
					]).toArray(
				(err,result)=>
				{
					if(err) throw err;
					if(!result[0]) 
					{
						res.send({err:"Yey! You reached the end."});
						return;
					}
					let a = result.reduce( ( cur, a , i ) => a._id==lower_id ? i : cur , -1 );
					// console.log(a);
					let lower =( a >= 0 ? a :  0);
					let end = Math.min( 5 , result.length-lower );


					// console.log(lower);
					let r = result.splice(lower,lower+end);
					// console.log("Le me see " +JSON.stringify(r));
					if(r.length==1 && lower_id)
						r.splice(0,1);
					res.send(( r[0] ?  r : {err: "Yey! You reached the end."}) );
					// res.send(result);
				}
			);

		

		});
		

	});
});
app.post('/api/content/add',(req,res)=>{
	validate("user",req,res,(id)=>{
		let value = req.body.value;
		req.body.origin.id = ObjectId(req.body.origin.id);
		db.collection('content').insertOne(
			{
				author: ObjectId(id),
				value : value,
				date : new Date(),
				origin : req.body.origin,
				shares: [],
				likes: [],
				replies: []
			},
		(err,result)=>{
			if(err) throw err;
			res.send({mes:"Your post has been published"});
		});	
	});
});

app.post('/api/content/profile',(req,res)=>{
	validate("user",req,res,(id)=>{

		let needle = req.body.needle || 0;
		let target = req.body.target || id;

		db.collection('content').aggregate(
			[
						{
							$match:
							{
								$or:
								[ 
									// { shares : { $in : following } },
									{ author : ObjectId(target) },
									// { group  : { $in : groups } }  ,
								]
							}
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'author',
								foreignField: '_id',
								as: 'author'
							}
						},
						{
							$unwind: {path:"$replies", preserveNullAndEmptyArrays: true},
						},
						{
							$lookup:
							{
								from: 'user',
								localField: 'replies.author',
								foreignField: '_id',
								as: 'replies.author'
							}
						},
						{
							$unwind: {path:"$replies.author", preserveNullAndEmptyArrays: true},
						},
						{

					        $group: {
					            _id: "$_id",
					            author: { $first : "$author"},
					            value: { $first : "$value"},
					            date: { $first : "$date"},
					            group: { $first : "$group"},
					            likes: { $first : "$likes"},
					            shares: { $first : "$shares"},
					            origin: { $first : "$origin"},
					            replies: { $push : "$replies"}
					        }
						},
						{
							$project:
							{
								_id:1,
								author: 
								{
									_id: true,
									name: true,
								},
								value: true,
								date: true,
								group: true,
								likes: true,
								shares: true,
								replies: 
								{
									$cond:
									{
										if: { $eq : [ [{}] , "$replies"  ] },
										then : [],
										else:
										{
											$map:
											{
												input: "$replies",
												as : "reply",
												in : 
												{
													$cond:
													{
														if : { $eq : [ {} , "$$reply" ]  },
														then: "$REMOVE",
														else:
															{
																value : "$$reply.value",
																author :"$$reply.author.name",
																author_id : "$$reply.author._id",
																date : "$$reply.date"
															}
													}
												}
											}
										}

									}
								},
								origin: true,


							}
						},
						{
							$sort:
							{
								date : -1
							}
						},
					]).toArray((err,result)=>{
			if(err) throw err;
			let idx = result.reduce((x,v,i)=> v._id == needle ? i : x  , -1);
			// idx  = idx > 0 ? idx : -1;
			let len  = Math.min( 5  ,result.length-idx )
			let r = result.splice(idx+1,len);
			res.send( (r[0])? r : {err:"You reached the end."} );
		});
	});
});

app.post('/api/search',(req,res)=>{
	validate("user",req,res,(id)=>{
		let query = req.body.query;
		let regx  = new RegExp(query,"i");
		db.collection('user').find({ $or : [ { "name.first" : regx } , { "name.middle" : regx } ,  { "name.last" : regx } ]  },{projection:{ name: 1  } }).toArray(
		(err,result)=>{
			if(err) throw err;
			// console.log(result);
			res.send(result.splice(0,5));
		});
	});
});
app.post('/api/search/group',(req,res)=>{
	validate("user",req,res,(id)=>{
		let query = req.body.query;
		let regx  = new RegExp(query,"i");
		db.collection('group').find({ $or : [ { name : regx } , { description : regx } ]  },{projection:{ name: 1  } }).toArray(
		(err,result)=>{
			if(err) throw err;
			console.log(result);
			res.send(result.splice(0,5));
		});
	});
});

//follow
app.post('/api/follow/add',(req,res)=>{
	validate("user",req,res,(id)=>{
		let user_id = req.body.target;
		db.collection('user').updateOne({ _id: ObjectId(id) },{ $push: { following: user_id } },(err,result)=>
		{
			if(err) throw err;
			db.collection('user').updateOne({_id: ObjectId(user_id)},{ $push: {followers: id } },(err,result)=>{
				if(err) throw err;
				res.send({mes:"You followed "});
			});
		});
	});
});

app.post('/api/follow/remove',(req,res)=>{
	validate("user",req,res,(id)=>{
		let user_id = req.body.target;
		db.collection('user').updateOne({ _id: ObjectId(id) },{ $pull: { following: user_id } },(err,result)=>
		{
			if(err) throw err;
			db.collection('user').updateOne({_id: ObjectId(user_id)},{ $pull: {followers: id } },(err,result)=>{
				if(err) throw err;
				res.send({mes:"Unfollow succesful"});
			});
		});
	});
});


//like
app.post('/api/like/add',(req,res)=>{
	validate("user",req,res,(id)=>{
		let post_id = req.body.post;
		db.collection('content').updateOne({ _id: ObjectId(post_id)},{ $addToSet : { likes : id } } , (err,result)=>{
			if(err) throw err;
			res.send({ mes : "Post Like"});
		});

	});
})

app.post('/api/like/remove',(req,res)=>{
	validate("user",req,res,(id)=>{
		let post_id = req.body.post;
		db.collection('content').updateOne({ _id: ObjectId(post_id)},{ $pull : { likes : id } } , (err,result)=>{
			if(err) throw err;
			res.send({ mes : "Post Unlike"});
		});

	});
})

//rt
app.post('/api/share/add',(req,res)=>{
	validate("user",req,res,(id)=>{
		let post_id = req.body.post;
		db.collection('content').updateOne({ _id: ObjectId(post_id)},{ $addToSet : { shares : id } } , (err, result)=>{
			if(err) throw err;
			res.send( { mes : "Post Shared"  } );
		});
	});
});
app.post('/api/share/remove',(req,res)=>{
	validate("user",req,res,(id)=>{
		let post_id = req.body.post;
		db.collection('content').updateOne({ _id: ObjectId(post_id)},{ $pull : { shares : id } } , (err, result)=>{
			if(err) throw err;
			res.send( { mes : "Post Unshared"  } );
		});
	});
});


//reply
app.post('/api/reply/add',(req,res)=>{
	validate("user",req,res,(id)=>{
		let post_id = req.body.post;
		let content = req.body.content;
		content.author = ObjectId(content.author);
		content.date = new Date(content.date);
		console.log(content.date);
		db.collection('content').updateOne({ _id : ObjectId(post_id) },{ $push : { replies : content } } , (err,result)=>{
			if(err) throw err;
			res.send( {mes : "Reply has been published."});
		});
	});
});
app.post('/api/reply/delete',(req,res)=>
{
	validate("user",req,res,(id)=>{
		let obj = req.body.obj;
		let post_id = req.body.post_id;
		db.collection('content').updateOne({ _id : ObjectId(post_id)},{ $pull : {replies: { value : obj.value , author: ObjectId(obj.author_id) , date: new Date(obj.date) } } },(err,result)=>{
			if(err) throw err;
			res.send( {mes: "Reply has been removed"} );
		});
	});
})

//groups
app.post('/api/group/add',(req,res)=>
{
	validate("user",req,res,(id)=>{
		let form = req.body.form;

		console.log(form);

		//convert to ids
		for(let i in form.admins)
			form.admins[i] = ObjectId(form.admins[i]._id);
		for(let i in form.members)
			form.members[i] = ObjectId(form.members[i]._id);
		form.admins.push(id);

		let doc=
		{
			name : form.name,
			description : form.description,
			admins:  form.admins,
			members: form.members,
		}



		db.collection('group').insertOne(doc,(err,result)=>
		{
			if(err) throw err;

			//add them to the group
			let  b = form.admins.concat(form.members);

			db.collection('user').updateMany( { _id : { $in : b } } , { $addToSet: { groups: result.ops[0]._id } } , (err, result1) =>
			{
				if(err) throw err;
				res.send({mes:"New group has been added."});
			} );

		});
	});
});

app.post('/api/group/edit',(req,res)=>
{
	validate("user",req,res,(id)=>
	{
		db.collection('group').findOne({ _id: ObjectId(req.body.id) },(err, result)=>
		{
			if(err) throw err;
			let admins = JSON.parse(JSON.stringify(result.admins));
			id = JSON.parse(JSON.stringify(id));
			delete req.body.form._id;
			if(admins.includes(id))
			{
				let form = req.body.form;
				for( i in form.admins)
				{
					form.admins[i]  = ObjectId(form.admins[i]._id);
				}
				for( i in form.members)
				{
					form.members[i]  = ObjectId(form.members[i]._id);
				}


				db.collection('group').updateOne({ _id: ObjectId(req.body.id) }, { $set : req.body.form }, (err,result) =>
				{
					if(err) throw err;
					res.send({mes: "Group Updated"});
				});
			}
			else
				res.send({err:"GROUP_PERMISSION_DENIED"});
		});
	});
})



app.post('/api/group/user',(req,res)=>
{
	validate("user",req,res,(id)=>
	{
		idx = req.body.id;
		db.collection("user").aggregate(
			[
				{ $match : { _id : ObjectId(idx) } },
				{ $project : { _id: 1, groups: 1  } },
				{ $lookup: { from: 'group', localField: 'groups', foreignField: '_id', as: 'groups' }}
			]).toArray((err,result)=>
			{
				if(err) throw err;
				console.log(result);
				res.send(result[0].groups);
			});
	});
});
app.post('/api/group/content',(req,res)=>
{
	validate('user',req,res,(id)=>{
		let lower_id = req.body.lower_id;
		let following = [];
		let groups = [];

		db.collection('content')
				.aggregate(
				[
					{ $match: { origin: { type: "group" , 
					id : ObjectId(req.body.id) 
				}   }  },
					{
						$lookup:
						{
							from: 'user',
							localField: 'author',
							foreignField: '_id',
							as: 'author'
						}
					},
					{
						$unwind: {path:"$replies", preserveNullAndEmptyArrays: true},
					},
					{
						$lookup:
						{
							from: 'user',
							localField: 'replies.author',
							foreignField: '_id',
							as: 'replies.author'
						}
					},
					{
						$lookup:
						{
							from: 'group',
							localField: 'origin.id',
							foreignField: '_id',
							as: 'origin.value'
						}
					},
					{
						$unwind: {path:"$replies.author", preserveNullAndEmptyArrays: true},
					},
					{

				        $group: {
				            _id: "$_id",
				            author: { $first : "$author"},
				            value: { $first : "$value"},
				            date: { $first : "$date"},
				            group: { $first : "$group"},
				            likes: { $first : "$likes"},
				            shares: { $first : "$shares"},
				            origin: { $first : "$origin"},
				            replies: { $push : "$replies"}
				        }
					},
					{
						$project:
						{
							_id:1,
							author: 
							{
								_id: true,
								name: true,
							},
							value: true,
							date: true,
							group: true,
							likes: true,
							shares: true,
							replies: 
							{
								$cond:
								{
									if: { $eq : [ [{}] , "$replies"  ] },
									then : [],
									else:
									{
										$map:
										{
											input: "$replies",
											as : "reply",
											in : 
											{
												$cond:
												{
													if : { $eq : [ {} , "$$reply" ]  },
													then: "$REMOVE",
													else:
														{
															value : "$$reply.value",
															author :"$$reply.author.name",
															author_id : "$$reply.author._id",
															date : "$$reply.date",
														}
												}
											}
										}
									}

								}
							},
							origin: true,


						}
					},
					{
						$sort:
						{
							date : -1
						}
					},
				]).toArray(
			(err,result)=>
			{
				if(err) throw err;
				if(!result[0]) 
				{
					res.send({err:"Yey! You reached the end."});
					return;
				}
				let a = result.reduce( ( cur, a , i ) => a._id==lower_id ? i : cur , -1 );
				console.log(a);
				let lower =( a >= 0 ? a :  0);
				let end = Math.min( 5 , result.length-lower );


				let r = result.splice(lower,lower+end);
				if(!r[0])
					r.splice(0,1);
				res.send(( r[0] ?  r : {err: "Yey! You reached the end."}) );
			}
		);
	});
});

app.post('/api/group/load',(req,res)=>
{
	validate("user",req,res,(id)=>{
		//aggregate
		db.collection('group').findOne({ _id: ObjectId(req.body.id) },(err, result)=>
		{
			if(err) throw err;
			let admins = JSON.parse(JSON.stringify(result.admins));
			id = JSON.parse(JSON.stringify(id));

			if(admins.includes(id))
			{
				db.collection('group').aggregate(
				[
					{ $match: { _id : ObjectId(req.body.id)}},
					{ $lookup : { from: 'user' , localField: 'admins' , foreignField: '_id', as: 'admins' } },
					{ $unwind: { path:"$admins" , preserveNullAndEmptyArrays: true} },
					{ $project: { _id: 1, name: 1, description: 1, members: 1, "admins.name": 1 ,"admins._id": 1, type: 1 } },
					{ $group: {
				            _id: "$_id",
				            name: { $first : "$name"},
				            type: { $first: "$type" },
				            description: { $first : "$description"},
				            members: { $first : "$members"},
				            admins: { $push : "$admins"},
				        }
					},
					{ $lookup : { from: 'user' , localField: 'members' , foreignField: '_id', as: 'members' } },
					{ $unwind: { path:"$members" , preserveNullAndEmptyArrays: true} },
					{ $project: { _id: 1, name: 1, description: 1, admins: 1, "members.name": 1 ,"members._id": 1, type: 1 } },
					{ $group: {
				            _id: "$_id",
				            name: { $first : "$name"},
				            type: { $first: "$type" },
				            description: { $first : "$description"},
				            admins: { $first : "$admins"},
				            members: { $push : "$members"},
				        }
					},
				]).toArray((err,result)=>
				{
					if(err) throw err;
					console.log(result[0].type);
					res.send(result[0]);
				});
			}
			else
			{
				res.send({err:"GROUP_PERMISSION_DENIED"});
			}
		});	

	});
})





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
