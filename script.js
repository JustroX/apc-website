
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

var app = angular.module("site",["ngRoute"]);

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



app.controller("dashboardController",($scope,$http,$location) => {

	//initialize editor
	var quill = new Quill('#editor-container', {
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
});


