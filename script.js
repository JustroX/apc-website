
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

app.filter('capitalize', function() {
    return function(input) {
      return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
    }
});

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
	$scope.provider ="home";

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

		page.posting = false;

		page.post = ()=>
		{
			//sanitize (anti - xss)
			if(page.posting)
				return;
			page.posting = true;
			let content = quill.root.innerHTML;

			let origin = {};
			if($scope.provider=="home") origin = { type: "profile"   };
			if($scope.provider=="group") origin = { type: "group" , id: $scope.sidebar.group.selected._id };

			$http.post('/api/content/add',{token:token,value:content, origin: origin }).
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

		if($scope.provider == "home") $scope.origin = "home";
		if($scope.provider == "group") $scope.origin = $scope.sidebar.group.selected.name;

		page.scrollup = ()=>
		{
			if($scope.provider == "home") 
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
			if($scope.provider == "group")
			{
				$scope.sidebar.group.load_content_recent();
			}
		}
		page.scrolldown = ()=>
		{
			if($scope.provider == "home") 
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
			if($scope.provider == "group")
			{
				$scope.sidebar.group.load_content();
			}
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

	$scope.addPage("group",(page)=>{

	});

	$scope.pages.search.run();


	//contents
	$scope.origin = "";
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
		$scope.content.reply.content.date  = new Date();
		$http.post("/api/reply/add",{token:token, post : $scope.content.reply_author._id , content : $scope.content.reply.content }).then((res)=>{
			res = res.data;
			if(res.err)
				return notify(res.err, "danger");
			$scope.content.reply.content.author = $scope.user.name;
			$scope.content.reply.content.author_id = $scope.user._id;
			$scope.content.reply_author.replies.push(JSON.parse(JSON.stringify($scope.content.reply.content)));	
			$scope.content.reply.content.value = "";
			$scope.content.reply.content.author_id = '';
		});
	}

	$scope.content.delete_confirm = false;
	$scope.content.delete_selected = null;
	$scope.content.press_delete_reply = (i)=>
	{
		$scope.content.delete_selected = i;
		if(!$scope.content.delete_confirm)
			$scope.content.delete_confirm = true;
		else
			$http.post("/api/reply/delete",{token:token, obj : i, post_id : $scope.content.reply_author._id }).then((res)=>
			{
				res = res.data;
				$scope.content.reply_author.replies.splice( $scope.content.reply_author.replies.indexOf(i) , 1  );
				$scope.content.delete_confirm = false;
			});
	}




	//Sidebar
	$scope.sidebar = {
		group:
		{
			selected : null,
			list: [],
			load: ()=>
			{
				$http.post('/api/group/user',{token:token, id: $scope.user._id }).then((res)=>
				{
					res = res.data;
					if(res.err) return notify(res.err,"danger");
					$scope.sidebar.group.list = res;
				});
			},
			load_content_recent : ()=>
			{
				$scope.provider = "group";
				$scope.goto("home");
			},
			load_content: ()=>
			{

				$http.post('/api/group/content',{token: token, id: $scope.sidebar.group.selected._id }).then((res)=>
				{
					res = res.data;
					if(res.err) return console.log(res.err, "danger");

					for(let i=0; i<res.length ; i++)
					{
						let a = res[i];
						console.log(a);
						$scope.pages.home.contents.push(a);
					}
				});

			},
			view: (i)=>
			{
				window.scrollTo(0, 0);
				$scope.sidebar.group.selected  = i;
				$scope.provider = "group";
				$scope.goto("home");
				$('#collapsible-groups').collapse('toggle');
				setTimeout(()=>
				{
					$('#collapsible-properties').collapse('toggle');
				},1);
			},
			add:
			{
				active: false,
				show: ()=>
				{
					$scope.goto("group");
					$scope.sidebar.group.add.active = true;
				},
				hide: ()=>
				{
					$scope.sidebar.group.add.active = false;
				},
				form:
				{
					name: "",
					description: "",
					admins : [],
					members : [], 
					type : "public",
				},
				search:
				{
					admin: "",
					member : "",
					results_admin : [],
					results_member : [],

					query : ()=>
					{
						$http.post('/api/search',{token:token , query: $scope.sidebar.group.add.search.admin }).then((res)=>{
							res = res.data;
							if(res.err) return console.log(res.err);
							$scope.sidebar.group.add.search.results_admin = res;
						});
					},

					query_member : ()=>
					{
						$http.post('/api/search',{token:token , query: $scope.sidebar.group.add.search.member }).then((res)=>{
							res = res.data;
							if(res.err) return console.log(res.err);
							$scope.sidebar.group.add.search.results_member = res;
						});
					},

					select_admin: (i)=>
					{
						if($scope.sidebar.group.add.form.admins.includes(i) || i._id == $scope.user._id)
							return;

						$scope.sidebar.group.add.form.admins.push(i);
						$scope.sidebar.group.add.search.admin = "";
					},

					select_member: (i)=>
					{
						if($scope.sidebar.group.add.form.members.includes(i))
							return;

						$scope.sidebar.group.add.form.members.push(i);
						$scope.sidebar.group.add.search.member = "";
					},
					remove_admin : (i)=>
					{
						for( let j in $scope.sidebar.group.add.form.admins )
						{
							if($scope.sidebar.group.add.form.admins[j]._id == i._id)
							{
								$scope.sidebar.group.add.form.admins.splice(j,1);
								return;
							}
						}
					},
					remove_member : (i)=>
					{
						for( let j in $scope.sidebar.group.add.form.members )
						{
							if($scope.sidebar.group.add.form.members[j]._id == i._id)
							{
								$scope.sidebar.group.add.form.members.splice(j,1);
								return;
							}
						}
					}
				},
				submit: ()=>
				{
					$http.post('/api/group/add',{token:token, form: $scope.sidebar.group.add.form}).then((res)=>
					{
						res = res.data;
						if(res.err) return notify(res.err,"danger");
						notify("New group has been added.");
						$scope.sidebar.group.add.form = 
						{
							name : "", description: "", admins: [], members: [], type: "public"
						};
						$scope.goto("home");
					});
				}
			},

			edit:
			{
				active: false,
				show: ()=>
				{
					$http.post("/api/group/load",{token:token, id: $scope.sidebar.group.selected._id}).then((res)=>
					{
						res = res.data;
						if(res.err) return notify(res.err,"danger");
						$scope.sidebar.group.edit.form = res;
						$scope.goto("group");
						$scope.sidebar.group.edit.active = true;
						$('#collapsible-properties').collapse('toggle');
					});
				},
				hide: ()=>
				{
					$scope.sidebar.group.edit.active = false;
				},
				form:
				{
					name: "",
					description: "",
					admins : [],
					members : [], 
					type : "public",
				},
				search:
				{
					admin: "",
					member : "",
					results_admin : [],
					results_member : [],

					query : ()=>
					{
						$http.post('/api/search',{token:token , query: $scope.sidebar.group.edit.search.admin }).then((res)=>{
							res = res.data;
							if(res.err) return console.log(res.err);
							$scope.sidebar.group.edit.search.results_admin = res;
						});
					},

					query_member : ()=>
					{
						$http.post('/api/search',{token:token , query: $scope.sidebar.group.edit.search.member }).then((res)=>{
							res = res.data;
							if(res.err) return console.log(res.err);
							$scope.sidebar.group.edit.search.results_member = res;
						});
					},

					select_admin: (i)=>
					{
						if($scope.sidebar.group.edit.form.admins.includes(i) || i._id == $scope.user._id)
							return;

						$scope.sidebar.group.edit.form.admins.push(i);
						$scope.sidebar.group.edit.search.admin = "";
					},

					select_member: (i)=>
					{
						if($scope.sidebar.group.edit.form.members.includes(i))
							return;

						$scope.sidebar.group.edit.form.members.push(i);
						$scope.sidebar.group.edit.search.member = "";
					},
					remove_admin : (i)=>
					{
						if($scope.sidebar.group.edit.form.admins.length==1) return;
						for( let j in $scope.sidebar.group.edit.form.admins )
						{
							if($scope.sidebar.group.edit.form.admins[j]._id == i._id)
							{
								$scope.sidebar.group.edit.form.admins.splice(j,1);
								return;
							}
						}
					},
					remove_member : (i)=>
					{
						for( let j in $scope.sidebar.group.edit.form.members )
						{
							if($scope.sidebar.group.edit.form.members[j]._id == i._id)
							{
								$scope.sidebar.group.edit.form.members.splice(j,1);
								return;
							}
						}
					}
				},
				submit: ()=>
				{
					$http.post('/api/group/edit',{token:token, form: $scope.sidebar.group.edit.form, id: $scope.sidebar.group.selected._id }).then((res)=>
					{
						res = res.data;
						if(res.err) return notify(res.err,"danger");
						notify(res.mes, "success");
						$scope.goto("home");
					});
				}
			}
		}
	};

	$scope.sidebar.group.load();







	$scope.goto("home");
	// alert("ere");





});


