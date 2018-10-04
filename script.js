
var cookie = 
{
	set: (cname, cvalue, exdays=1) =>
	{
	    var d = new Date();
	    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
	    var expires = "expires="+d.toUTCString();
	    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
	},

	get: (cname) =>
	{
	    var name = cname + "=";
	    var ca = document.cookie.split(';');
	    for(var i = 0; i < ca.length; i++) {
	        var c = ca[i];
	        while (c.charAt(0) == ' ') {
	            c = c.substring(1);
	        }
	        if (c.indexOf(name) == 0) {
	            return c.substring(name.length, c.length);
	        }
	    }
	    return "";
	}
}

var token;

var app = angular.module("site",["ngRoute",'ngSanitize']);
var notify = ( mes , type = "success" )=>
{
	$.notify({
		message: mes
	},{
		type: type,
		timer: 4000,
		placement: {
			from: 'top',
			align: 'right'
		}
	});
}

app.config( ($routeProvider) => {
	$routeProvider
	.when("/",{
		templateUrl: "/pages/preloader.ejs"
	})
	.when("/login",{
		templateUrl: "/pages/login.ejs"
	})
	.when("/dashboard",{
		templateUrl: "/pages/dashboard.ejs"
	})
	.when("/home",{
		templateUrl: "/pages/home.ejs"
	})
} );

app.controller("preloaderController",($scope,$http,$location) => {
	token  = cookie.get("apc-token");
	if(token) // 
		$location.path("/dashboard");
	else
		$location.path("/home");
});

app.controller("authController", ($scope,$http,$location) =>{
	$scope.form = {};
	$scope.auth_failed =false;
	$scope.submit = ()=>
	{
		$scope.loading =true;
		$scope.auth_failed =true;
		$http.post('/api/auth',{form: $scope.form}).then((res)=>{
			res = res.data;
			$scope.loading =false;
			if(res.err)
			{
				$scope.auth_failed =true;
				$scope.form = { username: '', password: ''};
			}
			else
			{
				//create token
				cookie.set("apc-token",res.token);
				$location.path('/dashboard');
			}

		});
	}
});



app.controller("dashboardController",($scope,$http,$location) => {

	//check if logged out
	if(!cookie.get('apc-token'))
	{
		$location.path('/home');
	}

	//user information
	token =cookie.get('apc-token');
	$scope.user = JSON.parse(atob(cookie.get('apc-token'))).payload ;
	//initialize editor
	var quill;

	$scope.editor= {active: false, textarea: quill};
	$scope.editor.open = ()=>
	{
		$scope.editor.active =  true;
		setTimeout(
			function()
			{
				quill.focus();
			},1
		)
	}
	$scope.editor.close = ()=>
	{
		$scope.editor.active =  false;
	}
	$scope.logout = ()=>
	{
		cookie.set('apc-token',0,-1);
		$location.path('/');
	}

	$scope.location = ["home"];
	$scope.pages = {};

	$scope.is_here = ( str )=>
	{
		str = str.split('/');
		var a = false;
		for(var i in str)
			a |= ( str[i] == $scope.location[i] );
		return a;
	}
	$scope.goto = (str)=>
	{	
		$scope.location = str.split('/');
		//run controller
		// if(!$scope.pages[$scope.location.join('/')]) alert($scope.location.join('/'));
		$scope.pages[$scope.location.join('/')].run();
	}
	$scope.addPage = (path,_f) =>
	{
		if(!$scope.pages[path])
			$scope.pages[path] = {};
		$scope.pages[path].run = ()=>{
			_f($scope.pages[path]);
		};
	}

	$scope.addPage("home", (page)=>{
		if(!quill)
		setTimeout(()=>{
			quill = new Quill('#editor-container', {
			  modules: {
			    toolbar: [
			      [{ header: [1, 2, false] }],
			      [{'font':[]}],
			      ['bold', 'italic', 'underline'],
			      ['image', 'code-block', 'link']
			    ]
			  },
			  placeholder: 'Write something...',
			  theme: 'snow'
			});
		},1);

		page.course = "";
		page.posting = false;

		page.post = ()=>
		{
			//sanitize (anti - xss)
			if(page.posting)
				return;
			page.posting = true;
			let content = quill.root.innerHTML;

			$http.post('/api/content/add',{token:token,value:content,location:page.course}).
			then(
				(res)=>
				{
					page.posting = false;
					quill.setContents([]);
					res = res.data;
					if(res.err) return console.log(res.err);
					notify("<b>"+res.mes+"</b>","success");
					page.scrollup();
				},
				(res)=>
				{
					page.posting = false;
					notify("<b>An error has occured when trying to publish your post.</b>","danger");
				},
			);
		}

		page.timeline_page =0;
		page.contents = [];
		page.upper_id = null;
		page.lower_id = "";

		page.scrollup = ()=>
		{
			page.upper_id = page.contents[0];
			if(page.upper_id) page.upper_id = page.upper_id._id;
			$http.post('/api/content/new',{token:token,upper_id:page.upper_id}).then((res)=>{
				res = res.data;
				if(res.err) return console.log(res.err);
				while(res.length !=0)
					page.contents.unshift(res.pop());
				console.log(res);
			});
		}
		page.scrolldown = ()=>
		{
			page.lower_id = page.contents[page.contents.length-1];
			if(page.lower_id) page.lower_id = page.lower_id._id;
			$http.post('/api/content/old',{token:token,lower_id:page.lower_id}).then((res)=>{
				res = res.data;
				if(res.err)
				{
					notify("<b>"+res.err+"</b>");
					return console.log(res.err);
				}
				// console.log(res.length);
				// console.log(JSON.stringify(res));
				for(let i=0; i<res.length ; i++)
				{
					let a = res[i];
					console.log(a);
					page.contents.push(a);
				}
			});
		}

		page.scrolldown();

		// page.load_next = ()=>
		// {
		// 	$http.post('/api/content',{token:token,page:page.timeline_page}).then((res)=>{
		// 		if(res.err) return console.log(res.err);
		// 		if()
		// 	});
		// }

	});

	$scope.addPage("root", (page)=>{
		//fetch users
		page.users = {};
		page.users.loading = true;

		page.modal ={};
		page.modal.form = 
		{
			username: "",
			password: "",
			rpassword: "",
			name: 
			{
				last: "",
				first: "",
				middle: "",
			},
			email: "",
			secondary:
			{
				school: "",
				batch: "",
			},
			priv: [],
		};

		page.modal.username_available = true;

		page.modal.priv_toggle = (str)=>
		{
			if(page.modal.form.priv.includes(str))
				page.modal.form.priv.splice(page.modal.form.priv.indexOf(str),1);
			else
				page.modal.form.priv.push(str);
		}
		page.modal.password_match = () =>
		{
			return page.modal.form.password == page.modal.form.rpassword;
		}

		page.modal.is_username_available = () =>
		{
			$http.post('/api/user/exists/username',{token:token,username:page.modal.form.username}).then((res)=>{
				res = res.data;
				if(res.err)
					return console.log(res.err);
				page.modal.username_available = res;
			});
		}

		page.modal.submit = ()=>
		{
			if(page.modal.mode == "add")
				page.modal.submit_add();
			else
				page.modal.submit_edit();

		}

		page.modal.submit_add = ()=>
		{
			page.modal.prompt = false;
			let form = page.modal.form;
			if(form.password != form.rpassword || !page.modal.username_available)
			{
				page.modal.prompt = true;
				return;
			}
			$http.post('/api/user/add',{token:token,form:form}).then((res)=>{
				$('#user-form-modal').modal('toggle');
				res = res.data;
				if(res.err)
				{
					notify(res.err,"danger");
					return console.log(res.err);
				}
				else
				{
					form={username: "",password: "",rpassword: "",name:{last: "",first: "",middle: "",},email: "",secondary:{school: "",batch: "",},priv: [],};
					notify(`<b>Add User</b>
							<p>` + res.mes +`</p>
						`,"success");
					page.onload();
				}
			});
		}

		page.modal.submit_edit = ()=>
		{
			page.modal.prompt = false;
			let form = page.modal.form;
			// alert(form.password);
			if((form.password != form.rpassword ) && form.password )
			{
				page.modal.prompt = true;
				return;
			}
			$http.post('/api/user/edit',{token:token,form:form,id:page.modal.target }).then((res)=>{
				$('#user-form-modal').modal('toggle');
				res = res.data;
				if(res.err)
				{
					notify(res.err,"danger");
					return console.log(res.err);
				}
				else
				{
					form={username: "",password: "",rpassword: "",name:{last: "",first: "",middle: "",},email: "",secondary:{school: "",batch: "",},priv: [],};
					notify(`<b>Edit User</b>
							<p>` + res.mes +`</p>
						`,"success");
					page.onload();
				}
			});
		}
		page.modal.submit_delete = ()=>
		{
			page.modal.prompt = false;
			let form = page.modal.form;
		
			$http.post('/api/user/delete',{token:token,id:page.modal.target._id }).then((res)=>{
				$('#user-delete-modal').modal('toggle');
				res = res.data;
				if(res.err)
				{
					notify(res.err,"danger");
					return console.log(res.err);
				}
				else
				{
					notify(`<b>Delete User</b>
							<p>` + res.mes +`</p>
						`,"success");
					page.onload();
				}
			});
		}

		page.onload =()=>
		{
			$http.post('/api/user',{token:token}).then((res)=>{
				res = res.data;
				page.users.loading = false;
				if(res.err)
				{
					 console.log(res.err);
					page.users.err = res.err;
				}
				else
				{
					// alert(JSON.stringify(res));
					page.users.list = res;
				}
			});
		}

		page.modal.title = "";
		page.modal.add = () =>
		{
			page.modal.title = "Manually Add New User";
			page.modal.mode = "add";
			$('#user-form-modal').modal('toggle');
		}
		page.modal.edit = (obj) =>
		{
			page.modal.title = "Edit User information.";
			page.modal.mode = "edit";
			page.modal.target = obj._id;
			page.modal.form = obj;
			$('#user-form-modal').modal('toggle');
		}
		page.modal.delete= (obj) =>
		{
			page.modal.target = obj;
			$('#user-delete-modal').modal('toggle');
		}

		page.onload();
	});

	$scope.addPage("profile", (page)=>{
		
		page.contents = [];
		page.needle = null;
		page.target = null;
		page.load_posts = ()=>
		{
			// if(page.needle == null)
				// page.needle = 0;
			// else
				// page.needle +=1;
			$http.post('/api/content/profile',{token:token, needle: page.needle, target:page.target }).then((res)=>{
				res = res.data;
				// console.log(res);
				if(res.err)
				{
					notify(res.err,"danger");
					return console.log(res.err);
				}
				for(let i of res)
					page.contents.push(i);
				page.needle = page.contents[page.contents.length-1]._id;
			});
		}

		page.load_posts();
	});

	$scope.addPage("profile_visit", (page)=>{
		page.contents = [];
		page.needle = null;

		page.user = {};
		page.followed = false;
		page.load_info = ( id )=>
		{
			$http.post('/api/user',{token:token , user: id}).then((res)=>{
				res = res.data;
				console.log(res);
				page.user = res[0];
				page.followed = page.user.followers.includes($scope.user._id);
				page.load_posts(id);
			});
		}
		page.load_posts = ( id )=>
		{
			$http.post('/api/content/profile',{token:token, needle: page.needle, target:id }).then((res)=>{
				res = res.data;
				if(res.err)
				{
					notify(res.err,"danger");
					return console.log(res.err);
				}
				for(let i of res)
					page.contents.push(i);
				page.needle = page.contents[page.contents.length-1]._id;

			});
		};
		page.follow_button_press = ()=>
		{
			if(page.followed)
				page.unfollow();
			else
				page.follow();
		}
		page.follow = ()=>
		{
			$http.post('/api/follow/add',{token:token,target: page.user._id}).then((res)=>{
				res = res.data;
				if(res.err)
					return notify(res.err,"danger");
				else
				{
					notify(res.mes+" "+page.user.name.first+"!","success");
					page.followed = true;
				}
			});
		}
		page.unfollow = ()=>
		{
			$http.post('/api/follow/remove',{token:token, target: page.user._id}).then((res)=>{
				res = res.data;
				if(res.err)
					return notify(res.err, "danger");
				else
				{
					page.followed = false;
				}
			});
		}
	});

	$scope.addPage("search",(page)=>{
		page.query = "";
		page.results = [];
		page.submit = ()=>
		{
			$http.post("/api/search",{token:token, query: page.query}).then((res)=>{
				res = res.data;
				page.results =res;
			});
		}
		page.visit = (i)=>
		{
			$scope.goto("profile_visit");
			$scope.pages.profile_visit.load_info(i._id);
			page.query = "";
		}
	});

	$scope.pages.search.run();


	//contents

	$scope.content = {reply:{content:{}}};
	$scope.content.press_like = (i)=>
	{
		if(i.likes.includes($scope.user._id))
			$scope.content.unlike(i);
		else
			$scope.content.like(i);
	}
	$scope.content.like = (i) =>
	{
		$http.post("/api/like/add",{token:token, post: i._id}).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			i.likes.push($scope.user._id);
		});
	}
	$scope.content.unlike = (i) =>
	{
		$http.post("/api/like/remove",{token:token, post: i._id}).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			i.likes.splice( i.likes.indexOf($scope.user._id) ,1);
		});
	}

	$scope.content.press_share = (i) =>
	{
		if(i.shares.includes($scope.user._id))
			$scope.content.unshare(i);
		else
			$scope.content.share(i);
	}

	$scope.content.share = (i)=>
	{
		$http.post("/api/share/add",{token: token, post: i._id}).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			i.shares.push( $scope.user._id );
		});
	}
	$scope.content.unshare = (i)=>
	{
		$http.post("/api/share/remove",{token: token, post: i._id}).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			i.shares.splice( i.shares.indexOf($scope.user._id) , 1 );
		});		
	}

	$scope.content.press_reply = (i) =>
	{
		$scope.content.reply_author = i;
		$("#conversation-modal").modal('toggle');
	}

	$scope.content.submit_reply = () =>
	{
		if(!$scope.content.reply.content.value) return;
		$scope.content.reply.content.author = $scope.user._id;
		$http.post("/api/reply/add",{token:token, post : $scope.content.reply_author._id , content : $scope.content.reply.content }).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			$scope.content.reply.content.author = $scope.user.name;
			$scope.content.reply_author.replies.push(JSON.parse(JSON.stringify($scope.content.reply.content)));	
			$scope.content.reply.content.value = "";
		});
	}

	$scope.goto("home");
	// alert("ere");





});


