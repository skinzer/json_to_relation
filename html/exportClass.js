/*
  Loaded by exportClass.html. Function startProgressStream()
  is called when the Export Class button is pressed. The function
  causes:
  dbadmin:datastage:Code/json_to_relation/json_to_relation/cgi_bin/exportClass.py
  to run on datastage. That remote execution is started via
  an EventSource, so that server-send messages from datastage
  can be displayed on the browser below the export class form.
*/

function ExportClass() {

    var screenContent = "";
    var source = null;
    var ws = null;
    var chosenCourseNameObj = null;
    var timer = null;
    // Form node containing the course name
    // selection list:
    var crsNmFormObj = null; 

    /*----------------------------  Constructor ---------------------*/
    this.construct = function() {
	ws =  new WebSocket("ws://localhost:8080/exportClass");
	ws.onopen = function() {};

	ws.onmessage = function(evt) {
	    // Internalize the JSON
	    // e.g. "{resp : "courseList", "args" : ['course1','course2']"
	    try {
		var argsObj = JSON.parse(evt.data);
		var response  = argsObj.resp;
		var args    = argsObj.args;
	    } catch(err) {
		alert('Bad response from server (' + evt.data + '): ' + err );
	    }
	    handleResponse(response, args);
	}
    }();

    /*----------------------------  Handlers for Msgs from Server ---------------------*/

    var handleResponse = function(responseName, args) {
	switch (responseName) {
	case 'courseList':
	    listCourseNames(args);
	    break;
	case 'progress':
	    displayProgressInfo(args);
	    break;
	case 'printTblInfo':
	    displayTableInfo(args);
	    break;
	case 'error':
	    alert('Error: ' + args);
	    break;
	default:
	    alert('Unknown response type from server: ' + responseName);
	    break;
	}
    }

    var listCourseNames = function(courseNameArr) {

	try {
	    if (courseNameArr.length == 0) {
		addTextToProgDiv("No matching course names found.");
		return;
	    }
	    //if (courseNameArr.length == 1) {
	    //    startProgressStream(courseNameArr[0]);
	    //}

	    clrProgressDiv();
	    addTextToProgDiv('<h3>Matching class names; pick one:</h3>');

	    // JSON encode/decode adds an empty string at the
	    // start of the course names array; eliminate that:
	    if (courseNameArr[0] == '""') {
		// Splice is a destructive op:
		courseNameArr.splice(0,1);
	    }

	    var len = courseNameArr.length
	    for (var i=0; i<len; ++i) {
		var crsNm = courseNameArr[i];
		// Remove surrounding double quotes from strings:
		crsNm = crsNm.replace(/"/g, '');
		theId = 'courseIDRadBtns' + i;
		addRadioButtonToProgDiv(crsNm, theId, 'courseIDChoice');
	    }

	    // Add the Now Get the Data button below the radio buttons:
	    addButtonToDiv('progress', 
			   'Get Data', 
			   'courseIDChoiceBtn', 
			   'classExporter.evtFinalCourseSelButton()');
	    
	    // Activate the first radiobutton (must do after the above 
	    // statement, else radio button is unchecked again:
	    document.getElementById('courseIDRadBtns0').checked = true;
	} catch(err) {
	    alert("Error trying to display course name list: " + err);
	}
    }

    var displayProgressInfo = function(strToDisplay) {
	addTextToProgDiv(strToDisplay);
    }

    var displayTableInfo = function(tblSamplesTxt) {
	addTextToProgDiv('<div class="tblExtract">' + tblSamplesTxt + '</div>');
    }

    /*----------------------------  Widget Event Handlers ---------------------*/

    this.evtResolveCourseNames = function() {
	/* Called when Export Class button is pushed. Request
	   that server find all matching course names:
	*/	
	courseIDRegExp = document.getElementById("courseID").value;
	// Course id regexp fld empty? If so: MySQL wildcard:
	if (courseIDRegExp.length == 0) {
	    courseIDRegExp = '%';
	}
	clrProgressDiv();
	queryCourseIDResolution(courseIDRegExp);
    }

    var evtFinalCourseSelButton = function() {
	// Get the full course name that is associated
	// with the checked radio buttion in the course
	// name list:
	var fullCourseName = getCourseNameChoice();
	if (fullCourseName == null) {
	    alert('Please (re-)select one of the classes');
	    return;
	}
	startProgressStream(fullCourseName);
    }

    this.evtCancelProcess = function() {
	try {
	    source.close();
	} catch(err) {}
	//*************window.clearInterval(timer);
	clrProgressDiv();
    }

    /*----------------------------  Utility Functions ---------------------*/

    var getCourseNameChoice = function() {
	try {
	    // Get currently checked course name radio button
	    // obj and store it in instance var:
	    var chosenCourseNameObj = document.querySelector('input[name="courseIDChoice"]:checked')
	    return chosenCourseNameObj.value;
	} catch(err) {
	    alert("System error: could not set course name radio button to checked.");
	    return null;
	}
    }

    var restoreCourseNameChoice = function() {
	// Adding to the progress div changes 
	// makes the chosen course appear unchecked,
	// even though its obj's 'checked' var is
	// true. Turn the radiobutton off and on
	// to restore the visibility of the checkmark:
	try {
	    if (chosenCourseNameObj != null) {
		chosenCourseNameObj.visbile = false;
		chosenCourseNameObj.visible = true;
	    }
	} catch(err) {
	    return;
	}
    }


    var progressUpdate = function() {
	// One-second timer showing date/time on screen while
	// no output is coming from server, b/c some entity
	// is buffering:
	var currDate = new Date();
	clrProgressDiv();
	addTextToProgDiv(screenContent + 
			 currDate.toLocaleDateString() + 
			 " " +
			 currDate.toLocaleTimeString()
			);
    }

    var queryCourseIDResolution = function(courseQuery) {
	req = buildRequest("reqCourseNames", courseQuery);
	ws.send(req);
    }

    var buildRequest = function(reqName, args) {
	// Given the name of a request to the server,
	// and its arguments, return a JSON string
	// ready to send to server:
	req = {"req" : reqName,
	       "args": args};
	return JSON.stringify(req);
    }


    var startProgressStream = function(resolvedCourseID) {
	/*Start the event stream, and install the required
	  event listeners on the EventSource
	*/
	var xmlHttp = null;
	var fileAction = document.getElementById("fileAction").checked;

	var argObj = {"courseId" : resolvedCourseID, "wipeExisting" : fileAction};
	var req = buildRequest("getData", argObj);

	// Start the progress timer; remember the existing
	// screen content in the 'progress' div so that
	// the timer func can append to that:
	
	screenContent = "<h2>Data Export Progress</h2>\n\n";
	addTextToProgDiv(screenContent);
	//*********timer = window.setInterval(progressUpdate,1000);

	ws.send(req);
    }

    /*----------------------------  Managing Progress Div Area ---------------------*/

    var clrProgressDiv = function() {
	/* Clear the progress information section on screen */
	progressNode = document.getElementById('progress');
	while (progressNode.firstChild) {
	    progressNode.removeChild(progressNode.firstChild);
	}
	hideClearProgressButton();
	hideCourseIdChoices()
    }

    var exposeClearProgressButton = function() {
	/* Show the Clear Progress Info button */
	document.getElementById("clrProgBtn").style.visibility="visible";
    }

    var hideClearProgressButton = function() {
	/* Hide the Clear Progress Info button */
	document.getElementById("clrProgBtn").style.visibility="hidden";
    }

    var clrProgressButtonVisible = function() {
	/* Return true if the Clear Progress Info button is visible, else false*/
	return document.getElementById("clrProgBtn").style.visibility == "visible";
    }

    var hideCourseIdChoices = function() {
	// Hide course ID radio buttons and the 'go do the data pull'
	// button if they have been inserted earlier:
	try {
	    document.getElementById("courseIDRadBtns").style.visibility="hidden";
	} catch(err){}
	try {
	    document.getElementById("courseIDChoiceBtn").style.visibility="hidden";
	} catch(err) {}
    }

    var exposeCourseIdChoices = function() {
	// Show course ID radio buttons and the 'go do the data pull'
	// button:
	document.getElementById("courseIDRadBtns").style.visibility="visible";
	document.getElementById("courseIDChoiceBtn").style.visibility="visible";
    }

    var createCourseNameForm = function() {
      crsNmFormObj = document.createElement('form');
      crsNmFormObj.setAttribute("id", "courseIDChoice");
      crsNmFormObj.setAttribute("name", "courseIDChoiceForm");
      document.getElementById('progress').appendChild(crsNmFormObj);
    }

    var addTextToProgDiv = function(txt) {
	txtNode = document.createElement('text');
	txtNode.data = txt;
	document.getElementById('progress').appendChild(txtNode);
    }

    var addRadioButtonToProgDiv = function(label, id, groupName) {
	// Add radio button with label to progress div:
	if (crsNmFormObj == null) {
	    // Form node does not yet exist within progress div:
            createCourseNameForm();
	}
	var radioObj = document.createElement('input');
	radioObj.setAttribute("type", "radio");
	radioObj.setAttribute("id", id);
	radioObj.setAttribute("name", groupName);
	crsNmFormObj.appendChild(radioObj);
  
	// Need label object associated witthe the new 
	// radio button, so that user can click on the 
	// label to activate the radio button:
	var labelObj     = document.createElement('label');
	labelObj.setAttribute("htmlFor", id);
	labelObj.setAttribute("for", id);
	labelObj.innerHTML = label;

	courseNameChoiceFormNode = document.getElementById('courseIDChoice');
	courseNameChoiceFormNode.appendChild(radioObj);
	courseNameChoiceFormNode.appendChild(labelObj);
	courseNameChoiceFormNode.appendChild(labelObj);
	courseNameChoiceFormNode.appendChild(makeBRNode());
    }

    var addButtonToDiv = function(divName, label, id, funcStr) {
	var btnObj = document.createElement('button');
	btnObj.innerHTML = label;
	btnObj.setAttribute('id', id);
	btnObj.onclick = function(){evtFinalCourseSelButton();};
	document.getElementById(divName).appendChild(btnObj);
    }

	var makeBRNode = function() {
	    return document.createElement('br');
	}

}
var classExporter = new ExportClass();
