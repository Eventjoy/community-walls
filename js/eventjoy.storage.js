window.store = {};

function initialiseDB() {

	console.log('Initialising local database...');
	///////////////////////
	if ( window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB ) {
		window.store.indexedDB = {};
		window.store.indexedDB.db = null;
		window.store.open = function() {
			var version = 7;
			console.log('Opening IndexedDB database...');
			try {
				var request = indexedDB.open("orders", version);
				// Create the storage (if doesn't exist). We can only create Object stores in a versionchange transaction.
				request.onupgradeneeded = function(e) {
					var db = e.target.result;

					// A versionchange transaction is started automatically.
					e.target.transaction.onerror = function(e) { console.log(e.value); };
					if(db.objectStoreNames.contains("order")) { db.deleteObjectStore("order"); }

					var store = db.createObjectStore("order",{keyPath: "ID"});
					store.createIndex("event_id", "event_id", { unique: false });
					store.createIndex("completed", "completed", { unique: false });
					store.transaction.oncomplete = function(e) {
						console.log("UPGRADE COMPLETED");	
					}
				};
				request.onsuccess = function(e) { window.store.indexedDB.db = e.target.result;  window.store.clear };
				request.onerror = function(e) { console.log(e.value);  };
			} catch (e) {
				// Raven.captureException(e);
				alert('Open exception... ' + e.message);
			}
		};
		window.store.clearOrders = function( callback ) {
			// console.log("Clear database");
			var db = window.store.indexedDB.db;
			try {
				var orderObjectStore = db.transaction("order", "readwrite").objectStore("order").clear();
				orderObjectStore.onsuccess = function(e) { if ( callback ) callback( true ) };
				orderObjectStore.onerror = function(e) { if ( callback ) callback( false ); console.log(e.value); };
			} catch (e) {
				console.log('Clear transaction exception... ' + e.message);
				if (callback) callback(false, order.ID, order);
			}
		}
		window.store.addOrder = function( order, callback ) {
			// console.log("Add an order to database");
			var db = window.store.indexedDB.db;
			try {
				var orderObjectStore = db.transaction("order", "readwrite").objectStore("order").add(order);
				orderObjectStore.onsuccess = function(e) { if ( callback ) callback( true, order.ID, order ) };
				orderObjectStore.onerror = function(e) { if ( callback ) callback( false, order.ID, order ); /* console.log(e.value); */};
			} catch (e) {
				console.log('Add transaction exception... ' + e.message);
				if (callback) callback(false, order.ID, order);
			}
		}
		window.store.putOrder = function( order, callback ) {

			var db = window.store.indexedDB.db;
			try {
				var request = db.transaction("order", "readwrite").objectStore("order").put({
					"order_id": order.ID,
					"data" : order
				});
				request.onsuccess = function(e) { if ( callback ) callback( true, order.ID, order ) };
				request.onerror = function(e) { if ( callback ) callback( false, order.ID, order ); console.log(e.value);};
			} catch (e) {
				// Raven.captureException(e);
				// alert('Put transaction exception... ' + e.message);
				console.log('Put transaction exception... ' + e.message);
				if (callback) callback(false, order.ID, order);
			}
		};

		window.store.getOrder = function( order_id, callback ) {
			var db = window.store.indexedDB.db;
			try {
				var request = db.transaction("order", "readonly").objectStore("order").get(order_id);
				request.onsuccess = function(event) {
					if (request.result) {
						if (callback) callback(true, order_id, request.result);
					} else {
						if (callback) callback(false, order_id, null);
					}
				};
				request.onerror = function(e) {
					if (callback) callback(false, order_id, null);
				};
			} catch (e) {
				// Raven.captureException(e);
				console.log('Get transaction exception... ' + e.message);
				if (callback) callback(false, order_id, null);
			}
		}

		// sort can only be next(asc) order, prev(desc) order.
		window.store.getOrders = function( sort, size, timestamp, callback ) {
			sort = sort.toLowerCase();
			if(sort && (sort == "prev" || sort == "next")) {
				// console.log(sort);
			} else {
				sort = "prev";	
				// console.log("Fixed to prev");
			}
			var db = window.store.indexedDB.db;
			try {
				var orders = [];
				var trans = db.transaction("order", "readonly");
				var request = trans.objectStore("order");
			    // var cursorRequest = request.openCursor();
			    var cursorRequest = request.index('completed').openCursor(null, sort);

				trans.oncomplete = function(e) {
					// if (callback) callback(true, orders);
				}

				var counter = 0;
				var prev = null;
				cursorRequest.onsuccess = function(event) {
					// console.log("Success getting orders");
					var cursor = event.target.result;
					if(cursor) {
						// Current one and one previous one
						// console.log(cursor.value.completed + ":" + timestamp);
						if(cursor.value.completed == timestamp && prev) {
							console.log("Got new one!");
							orders.push(prev);
							counter++;
							orders.push(cursor.value);
							counter++;
						} else {
							if(timestamp) {
								callback(true, []);
							}
						}
						// console.log(counter + " : " + size);
						if(counter < size || size == -1) {
							// Next 4
							if(!timestamp || cursor.value.completed < timestamp) {
								orders.push(cursor.value);
								counter++;
							} else {
								prev = cursor.value;
								// console.log("SKIPPING");
							}
						} else {
							prev = cursor.value;
							// console.log("SKIP");
						}

						if(counter == size && callback) { callback(false, orders); counter++; }

						cursor.continue();
					} else {
						if(counter < size) {
							// Ran out of order before size is met.  So return whatever is added.
							callback(true, orders);
						}
					}
				};
				cursorRequest.onerror = function(e) {
					if (callback) callback(false, null);
				};
			} catch (e) {
				// Raven.captureException(e);
				console.log('Get orders exception... ' + e.message);
				if (callback) callback(false, null);
			}
		}

		window.store.getTotalRevenue = function( callback ) {
			var db = window.store.indexedDB.db;
			// console.log( 'Get total revenue... ');
			try {
				var revenue = 0;
				var trans = db.transaction("order", "readonly")
				var request = trans.objectStore("order");
			    var cursorRequest = request.openCursor();

				trans.oncomplete = function(e) {
					if (callback) callback(true, revenue);
				}

				cursorRequest.onsuccess = function(event) {
					var cursor = event.target.result;
					if(cursor) {
						var number = Number(cursor.value.total.replace(/[^0-9\.]+/g,""));
						revenue += number;
						cursor.continue();
					}
				};
				cursorRequest.onerror = function(e) {
					if (callback) callback(false, 0);
				};
			} catch (e) {
				// Raven.captureException(e);
				console.log('Get total revenue exception... ' + e.message);
				if (callback) callback(false, 0);
			}
		}
		window.store.getTotalAttendees = function( callback ) {
			var db = window.store.indexedDB.db;
			// console.log( 'Get total attendees... ');
			try {
				var totalAttendees = 0;
				var trans = db.transaction("order", "readonly")
				var request = trans.objectStore("order");
			    var cursorRequest = request.openCursor();

				trans.oncomplete = function(e) {
					if (callback) callback(true, totalAttendees);
				}

				cursorRequest.onsuccess = function(event) {
					var cursor = event.target.result;
					if(cursor) {
						totalAttendees += cursor.value.num_of_attendees;
						cursor.continue();
					}
				};
				cursorRequest.onerror = function(e) {
					if (callback) callback(false, 0);
				};
			} catch (e) {
				// Raven.captureException(e);
				console.log('Get total attendees exception... ' + e.message);
				if (callback) callback(false, 0);
			}
		}
	}

	///////////////////////
	// WEBSQL functions
	// else if ( !!window.openDatabase ) {
	// 	window.store.websql = {};
	// 	window.store.websql.db = null;
	// 	window.store.open = function() {
	// 		var version = '1';
	// 		console.log('Opening WebSQL database...');
	// 		//if ( toastPlugin ) toastPlugin.show('Opening database...', 200);
	// 		var db = openDatabase('files', version, 'file storage', 5 * 1024 * 1024);
	// 		if ( db ) {
	// 			window.store.websql.db = db;
	// 			db.transaction(function (tx) {
	// 				tx.executeSql('CREATE TABLE IF NOT EXISTS file (filename TEXT PRIMARY KEY, data BLOB)', [], function(t, r) {
	// 					//console.log('success');
	// 				}, function(t, e) {
	// 					console.log(e);
	// 				});
	// 			});
	// 		} else {

	// 		}
	// 	};
	// 	window.store.putFile = function( filename, data, userdata, callback ) {
	// 		var db = window.store.websql.db;
	// 		//console.log('Initiating put transaction...');
	// 		try {
	// 			db.transaction(function (tx) {
	// 				var filename2 = filename;
	// 				var query = 'INSERT INTO file (filename, data) VALUES ("'+filename2+'", "'+data+'")';
	// 				//console.log('Executing query:'+query);
	// 				tx.executeSql(query, [], function(t, r) {
	// 					if ( callback ) callback( true, filename2, userdata );
	// 				}, function(t, e) {
	// 					console.log(e);
	// 					if ( callback ) callback( false, filename2, userdata );
	// 				});
	// 			});
	// 		} catch(e) {
	// 			// Raven.captureException(e);
	// 			console.log('Transaction exception occurred');
	// 			if ( callback ) callback( false, filename, userdata );
	// 		}
	// 	};
	// 	window.store.getFile = function( filename, userdata, callback ) {
	// 		var db = window.store.websql.db;
	// 		//console.log('Initiating get transaction...');
	// 		try {
	// 			db.readTransaction(function (tx) {
	// 				var filename2 = filename;
	// 				var query = 'SELECT * FROM file WHERE filename = "'+filename+'"';
	// 				//console.log('Executing query:'+query);
	// 				tx.executeSql(query, [], function(t, r) {
	// 					if ( r.rows.length > 0 ) {
	// 						var len = r.rows.length, i;
	// 						for (i = 0; i < len; i++) {
	// 							var filename = r.rows.item(i).filename;
	// 							var data = r.rows.item(i).data;
	// 							if ( callback ) callback( true, filename2, data, userdata );
	// 							break; // Break here as only one result should be returned
	// 						}
	// 					} else {
	// 						if ( callback ) callback( false, filename2, null, userdata );
	// 					}
	// 				}, function(t, e) {
	// 					console.log(e);
	// 					if ( callback ) callback( false, filename2, null, userdata );
	// 				});
	// 			}, function(e) {
	// 				console.log('Database transaction error: '+e);
	// 				if ( callback ) callback( false, filename, null, userdata );
	// 			}, function() {
	// 				//console.log('Transaction success');
	// 			});
	// 			//console.log('Transaction initiated...');
	// 		} catch(e) {
	// 			// Raven.captureException(e);
	// 			console.log('Transaction exception occurred');
	// 			if ( callback ) callback( false, filename, null, userdata );
	// 		}
	// 	};
	// 	window.store.deleteFile = function( filename, userdata, callback ) {
	// 		var db = window.store.websql.db;
	// 		//console.log('Initiating get transaction...');
	// 		try {
	// 			db.transaction(function (tx) {
	// 				var filename2 = filename;
	// 				var query = 'DELETE FROM file WHERE filename LIKE "'+filename+'"';
	// 				//console.log('Executing query:'+query);
	// 				tx.executeSql(query, [], function(t, r) {
	// 					//console.log(r);
	// 					if ( callback ) callback( true, filename2, null, userdata );
	// 				}, function(t, e) {
	// 					console.log(query);
	// 					console.log(e);
	// 					if ( callback ) callback( false, filename2, null, userdata );
	// 				});
	// 			}, function(e) {
	// 				console.log('Database transaction error: '+e);
	// 				if ( callback ) callback( false, filename, null, userdata );
	// 			}, function() {
	// 				//console.log('Transaction success');
	// 			});
	// 			//console.log('Transaction initiated...');
	// 		} catch(e) {
	// 			// Raven.captureException(e);
	// 			console.log('Transaction exception occurred');
	// 			if ( callback ) callback( false, filename, null, userdata );
	// 		}
	// 	};
	// } else {
	// 	window.store.open = function() {
	// 		console.log('No database available. Using localstorage.');
	// 	};
	// 	window.store.putFile = function( filename, data, userdata, callback ) {
	// 		//console.log( 'Storing file: '+filename );
	// 		localStorage.setItem('file:'+filename, data);
	// 		if ( callback ) callback( true, filename, userdata );
	// 	};
	// 	window.store.deleteFile = function( filename, userdata, callback ) {
	// 		localStorage.removeItem('file:'+filename);
	// 		if ( callback ) callback( true, filename, null, userdata );
	// 	};
	// 	window.store.getFile = function( filename, userdata, callback ) {
	// 		var data = localStorage.getItem('file:'+filename);
	// 		if ( data ) {
	// 			//console.log( 'Retrieved file: '+filename );
	// 			data += '=';
	// 			if ( data.length % 4 !== 0) data += ('='.substr(0, 4 - data.length % 4));
	// 			if ( callback ) callback( true, filename, data, userdata );
	// 		} else {
	// 			//console.log( 'File not in store: '+filename );
	// 			if ( callback ) callback( false, filename, null, userdata );
	// 		}
	// 	};
	// }

	//////////////////////////////
	// Database agnostic functions
	// window.store.cacheImage = function( filename, url, userdata, callback ) {
	// 	var xmlhttp;
	// 	if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
	// 		xmlhttp = new XMLHttpRequest();
	// 	} else { // code for IE6, IE5
	// 		xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
	// 	}
	// 	xmlhttp.onreadystatechange = function() {
	// 		if (xmlhttp.readyState === 4) {
	// 			if (xmlhttp.status === 200) {
	// 				if ( xmlhttp.responseText.length > 0 ) {
	// 					var filedata = "data:image/png;base64," + xmlhttp.responseText;
	// 					// Moved callback outside of putFile... may as well return the image now we have it, and perform 'put' operation in the background
	// 					if (callback) callback(true, filename, filedata, userdata);	
	// 					window.store.putFile(filename, filedata, userdata, function(success, filename, userdata) {
	// 						//if (callback) callback(success, filename, filedata, userdata);
	// 					});
	// 				} else {
	// 					console.log('window.store.cacheImage: Invalid response for image: '+url);
	// 					if (callback) callback(false, filename, null, userdata);
	// 				}
	// 			} else {
	// 				console.log('window.store.cacheImage: Non-successful status ('+xmlhttp.status+'): '+url);
	// 				if (callback) callback(false, filename, null, userdata);
	// 			}
	// 		}
	// 	};  
	// 	xmlhttp.onerror = function() {
	// 		console.log('window.store.cacheImage: xmlhttp.onerror: '+url);
	// 		if (callback) callback(false, filename, null, userdata);
	// 	};

	// 	xmlhttp.open("GET", 'https://www.eventjoy.com/m/fetch.php?url='+encodeURIComponent(B64.encode(url)) );
	// 	xmlhttp.timeout = 30000;
	// 	xmlhttp.ontimeout = function () {
	// 		console.log('window.store.cacheImage: xmlhttp.ontimeout: '+url);
	// 		if (callback) callback(false, filename, null, userdata);
	// 	};
	// 	xmlhttp.send(null);
	// };

	window.store.open();
}