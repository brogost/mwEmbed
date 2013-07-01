( function( mw, $ ) { "use strict";

mw.FullScreenManager = function( embedPlayer, layoutBuilder ) {
	return this.init( embedPlayer, layoutBuilder );
};

mw.FullScreenManager.prototype = {

	// Flag to store the current fullscreen mode
	inFullScreen: false,

	parentsAbsoluteList : [],
	parentsRelativeList: [],

	init: function( embedPlayer, layoutBuilder ) {
		this.embedPlayer = embedPlayer;
		this.layoutBuilder = layoutBuilder;
		return this;
	},

	/**
	 * Check if we're in Fullscreen
	 * @return {boolean)
	 */
	isInFullScreen: function() {
		return this.inFullScreen;
	},

	/**
	 * Toggles full screen by calling
	 *  doFullScreenPlayer to enable fullscreen mode
	 *  restoreWindowPlayer to restore window mode
	 */
	toggleFullscreen: function() {
		// Do normal in-page fullscreen handling:
		if( this.isInFullScreen() ){
			this.restoreWindowPlayer();
		}else {
			this.doFullScreenPlayer();
		}
	},

	/**
	* Do full-screen mode
	*/
	doFullScreenPlayer: function( callback ) {
		mw.log("PlayerLayoutBuilder:: doFullScreenPlayer" );
		// Setup pointer to control builder :
		var _this = this;

		// Setup local reference to embed player:
		var embedPlayer = this.embedPlayer;

		// Setup a local reference to the player interface:
		var $interface = embedPlayer.getInterface();
		// Check fullscreen state ( if already true do nothing )
		if( this.isInFullScreen() == true ){
			return ;
		}
		this.inFullScreen = true;

		// store the verticalScrollPosition
		var isIframe = mw.getConfig('EmbedPlayer.IsIframeServer' ),
		doc = isIframe ? window['parent'].document : window.document,
		context = isIframe ? window['parent'] : window;
		this.verticalScrollPosition = (doc.all ? doc.scrollTop : context.pageYOffset);
		
		// Add fullscreen class to interface:
		$interface.addClass( 'fullscreen' );
		
		// if overlaying controls add hide show player binding.
		if( _this.layoutBuilder.isOverlayControls() ){
			_this.addFullscreenMouseMoveHideShowControls();
		}

		// Check for native support for fullscreen and we are in an iframe server
		if( window.fullScreenApi.supportsFullScreen && !mw.isMobileChrome() ) {
			_this.preFullscreenPlayerSize = this.getPlayerSize();
			var fullscreenHeight = null;
			var fsTarget = this.getFsTarget();

			var escapeFullscreen = function( event ) {
				// grab the correct document target to check for fullscreen
				var doc = ( mw.getConfig('EmbedPlayer.IsIframeServer' ) )?
						window['parent'].document:
						window.document;
				if ( ! window.fullScreenApi.isFullScreen( doc ) ) {
					_this.restoreWindowPlayer();
				}
			}
			// remove any old binding:
			fsTarget.removeEventListener(  fullScreenApi.fullScreenEventName, escapeFullscreen );
			// Add a binding to catch "escape" fullscreen
			fsTarget.addEventListener( fullScreenApi.fullScreenEventName, escapeFullscreen );
			// Make the iframe fullscreen:
			window.fullScreenApi.requestFullScreen( fsTarget );

			// There is a bug with mozfullscreenchange event in all versions of firefox with supportsFullScreen
			// https://bugzilla.mozilla.org/show_bug.cgi?id=724816
			// so we have to have an extra binding to check for size change and then restore.
			if( $.browser.mozilla ){
				_this.fullscreenRestoreCheck = setInterval( function(){
					if( fullscreenHeight && $(window).height() < fullscreenHeight ){
						// Mozilla triggered size change:
						clearInterval ( _this.fullscreenRestoreCheck );
						_this.restoreWindowPlayer();
					}
					// Set fullscreen height:
					if( ! fullscreenHeight && _this.preFullscreenPlayerSize.height != $(window).height() ){
						fullscreenHeight = $(window).height();
					}
				}, 250 );
			}
		} else {
			// Check for hybrid html controls / native fullscreen support:
			var vid = this.embedPlayer.getPlayerElement();
			if( mw.getConfig('EmbedPlayer.EnableIpadNativeFullscreen')
					&&
				vid && vid.webkitSupportsFullscreen
			){
				this.doHybridNativeFullscreen();
				return ;
			} else {
				// make the player target or iframe fullscreen
				this.doContextTargetFullscreen();
			}
		}

		// Bind escape to restore in page clip ( IE9 needs a secondary escape binding )
		$( window ).keyup( function( event ) {
			// Escape check
			if( event.keyCode == 27 ){
				_this.restoreWindowPlayer();
			}
		} );

		// trigger the open fullscreen event:
		$( embedPlayer ).trigger( 'onOpenFullScreen' );
	},

	/**
	 * Make the target player interface or iframe fullscreen
	 */
	doContextTargetFullscreen: function() {
		var isIframe = mw.getConfig('EmbedPlayer.IsIframeServer' );

		var
		_this = this,
		doc = isIframe ? window['parent'].document : window.document,
		$doc = $( doc ),
		$target = $( this.getFsTarget() ),
		context = isIframe ? window['parent'] : window;

		// update / reset local restore properties
		this.parentsAbsoluteList = [];
		this.parentsRelativeList = [];

		// Set the original parent page scale if possible:
		this.orginalParnetViewPortContent = $doc.find( 'meta[name="viewport"]' ).attr( 'content' );
		this.orginalTargetElementLayout = {
			'style' : $target[0].style.cssText,
			'width' : $target.width(),
			'height' : $target.height()
		};
		mw.log("PlayerControls:: doParentIframeFullscreen> verticalScrollPosition:" + this.verticalScrollPosition);
		context.scroll(0, 0);

		// Make sure the parent page page has a zoom of 1:
		if( ! $doc.find('meta[name="viewport"]').length ){
			$doc.find('head').append( $( '<meta />' ).attr('name', 'viewport') );
		}
		$doc.find('meta[name="viewport"]').attr('content', 'width=1024, user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1' );

		// iPad 5 supports fixed position in a bad way, use absolute pos for iOS
		var playerCssPosition = ( mw.isIOS() ) ? 'absolute': 'fixed';

		// Remove absolute css of the $target's parents
		$target.parents().each( function() {
			var $parent = $( this );
			if( $parent.css( 'position' ) == 'absolute' ) {
				_this.parentsAbsoluteList.push( $parent );
				$parent.css( 'position', 'static' );
			}
			if( $parent.css( 'position' ) == 'relative' ) {
				_this.parentsRelativeList.push( $parent );
				$parent.css( 'position', 'static' );
			}
		});

		// Make the $target fullscreen
		$target
			.css({
				'z-index': mw.getConfig( 'EmbedPlayer.FullScreenZIndex' ),
				'position': playerCssPosition,
				'top' : '0px',
				'left' : '0px',
				'margin': 0
			})
			.data(
				'isFullscreen', true
			)
		.after(
			// add a placeholder div to retain page layout in float / block based pages.  
			$('<div>').addClass('player-placeholder').css({
				'width': this.orginalTargetElementLayout.width,
				'height': this.orginalTargetElementLayout.height
			})
		)

		var updateTargetSize = function() {
			context.scroll(0, 0);
			var innerHeight = context.innerHeight;
			// mobile android chrome has an off by one bug for inner window size: 
			if( mw.isMobileChrome() ){
				innerHeight+=1;
			}

			// Set innerHeight respective of Android pixle ratio
			if( ( mw.isAndroid41() || mw.isAndroid42() || ( mw.isAndroid() && mw.isFirefox() ) ) && !mw.isMobileChrome() 
					&& 
				context.devicePixelRatio
			) {
				innerHeight = context.outerHeight / context.devicePixelRatio;
			}

			$target.css({
				'width' : context.innerWidth,
				'height' : innerHeight
			});

			if ( mw.isAndroid() && !mw.isMobileChrome() ) {
				$target.trigger( 'resize' ); // make sure we have a resize event on target
			}
			
			// update player size if needed:
			_this.embedPlayer.applyIntrinsicAspect();
		};

		var updateSizeByDevice = function() {
			if ( mw.isAndroid() ) {
				setTimeout(updateTargetSize, 10);
			} else {
				updateTargetSize();
			}
		};

		updateSizeByDevice();

		// Android fires orientationchange too soon, i.e width and height are wrong
		var eventName = mw.isAndroid() ? 'resize' : 'orientationchange';
		eventName += this.bindPostfix;

		// Bind orientation change to resize player ( if fullscreen )
		$( context ).bind( eventName, function(){
			if( _this.isInFullScreen() ){
				updateSizeByDevice();
			}
		});
        
		// prevent scrolling when in fullscreen: ( both iframe and dom target use document )
		document.ontouchmove = function( e ){
			if( _this.isInFullScreen() ){
				e.preventDefault();
			}
		};
	},
	/**
	 * Restore the player interface or iframe to a window player
	 */
	restoreContextPlayer: function(){
		var isIframe = mw.getConfig('EmbedPlayer.IsIframeServer' );
		var
		_this = this,
		doc = isIframe ? window['parent'].document : window.document,
		$doc = $( doc ),
		$target = $( this.getFsTarget() ),
		context = isIframe ? window['parent'] : window;

		mw.log("PlayerControlsBuilder:: restoreContextPlayer> verticalScrollPosition:" + this.verticalScrollPosition );

		// Restore document zoom:
		if( this.orginalParnetViewPortContent ){
			$doc.find('meta[name="viewport"]').attr('content', this.orginalParnetViewPortContent );
		} else {
			// Restore user zoom: ( NOTE, there does not appear to be a way to know the
			// initial scale, so we just restore to 1 in the absence of explicit viewport tag )
			// In order to restore zoom, we must set maximum-scale to a valid value
			$doc.find('meta[name="viewport"]').attr('content', 'initial-scale=1, maximum-scale=8, minimum-scale=1, user-scalable=yes' );
			// Initial scale of 1 is too high. Restoring default scaling.
			if ( mw.isMobileChrome() ) {
				$doc.find('meta[name="viewport"]').attr('content', 'user-scalable=yes' );
			}
		}
		if( this.orginalTargetElementLayout ) {
			$target[0].style.cssText = this.orginalTargetElementLayout.style;
			$target.attr({
				'width': this.orginalTargetElementLayout.width,
				'height': this.orginalTargetElementLayout.height
			}).trigger( 'resize' )
			// update player size if needed:
			_this.embedPlayer.applyIntrinsicAspect();
			// remove placeholder
			$target.siblings( '.player-placeholder').remove();
		}
		
		// Restore any parent absolute pos:
		$.each( _this.parentsAbsoluteList, function(inx, $elm) {
			$elm.css( 'position', 'absolute' );
		} );
		$.each( _this.parentsRelativeList, function(inx, $elm) {
			$elm.css( 'position', 'relative' );
		} );
		// Scroll back to the previews position ( in a timeout to allow dom to update )
		setTimeout( function(){
			context.scroll( 0, _this.verticalScrollPosition );
		},100)
	},

	/**
	 * Supports hybrid native fullscreen, player html controls, and fullscreen is native
	 */
	doHybridNativeFullscreen: function(){
		var vid = this.embedPlayer.getPlayerElement();
		var _this = this;
		vid.webkitEnterFullscreen();
		// start to pull for exit fullscreen:
		this.fsIntervalID = setInterval( function(){
			var currentFS = vid.webkitDisplayingFullscreen;
			// Check if we have entered fullscreen but the player
			// has exited fullscreen with native controls click
			if( _this.isInFullScreen() && !currentFS ){
				// restore non-fullscreen player state
				_this.inFullScreen = false;
				// Trigger the onCloseFullscreen event:
				$( _this.embedPlayer ).trigger( 'onCloseFullScreen' );
				// Remove fullscreen class
				_this.embedPlayer.getInterface().removeClass( 'fullscreen' );
				// stop polling for state change.
				clearInterval( _this.fsIntervalID );
			}
		}, 250 );
	},

	doDomFullscreen: function(){
		var _this = this;
		var embedPlayer = this.embedPlayer;
		var $interface = embedPlayer.getInterface();
		// Remove any old mw-fullscreen-overlay
		$( '.mw-fullscreen-overlay' ).remove();

		_this.preFullscreenPlayerSize = this.getPlayerSize();

		// Add the css fixed fullscreen black overlay as a sibling to the video element
		// iOS4 does not respect z-index
		$interface.after(
			$( '<div />' )
			.addClass( 'mw-fullscreen-overlay' )
			// Set some arbitrary high z-index
			.css('z-index', mw.getConfig( 'EmbedPlayer.FullScreenZIndex' ) )
			.hide()
			.fadeIn("slow")
		);

		// get the original interface to absolute positioned:
		if( ! this.windowPositionStyle  ){
			this.windowPositionStyle = $interface.css( 'position' );
		}
		if( !this.windowZindex ){
			this.windowZindex = $interface.css( 'z-index' );
		}
		// Get the base offset:
		this.windowOffset = this.getWindowOffset();

		// Change the z-index of the interface
		$interface.css( {
			'position' : 'fixed',
			'z-index' : mw.getConfig( 'EmbedPlayer.FullScreenZIndex' ) + 1,
			'top' : this.windowOffset.top,
			'left' : this.windowOffset.left
		} );

		// If native persistent native player update z-index:
		if( embedPlayer.isPersistentNativePlayer() ){
			$( embedPlayer.getPlayerElement() ).css( {
				'z-index': mw.getConfig( 'EmbedPlayer.FullScreenZIndex' ) + 1,
				'position': 'absolute'
			});
		}

		// Empty out the parent absolute index
		_this.parentsAbsolute = [];

		// Hide the body scroll bar
		$('body').css( 'overflow', 'hidden' );

		var topOffset = '0px';
		var leftOffset = '0px';

		// Check if we have an offsetParent
		if( $interface.offsetParent()[0].tagName
				&&
			$interface.offsetParent()[0].tagName.toLowerCase() != 'body' )
		{
			topOffset = -this.windowOffset.top + 'px';
			leftOffset = -this.windowOffset.left + 'px';
		}

		// Overflow hidden in fullscreen:
		$interface.css( 'overlow', 'hidden' );

		// Remove absolute css of the interface parents
		$interface.parents().each( function() {
			//mw.log(' parent : ' + $( this ).attr('id' ) + ' class: ' + $( this ).attr('class') + ' pos: ' + $( this ).css( 'position' ) );
			if( $( this ).css( 'position' ) == 'absolute' ) {
				_this.parentsAbsolute.push( $( this ) );
				$( this ).css( 'position', null );
				mw.log( 'PlayerLayoutBuilder::  should update position: ' + $( this ).css( 'position' ) );
			}
		});

		// Bind escape to restore in page clip
		$( window ).keyup( function( event ) {
			// Escape check
			if( event.keyCode == 27 ){
				_this.restoreWindowPlayer();
			}
		} );
	},	

	// Display a fullscreen tip if configured to do and the browser supports it.
	displayFullscreenTip: function(){
		var _this = this;
		// Mobile devices don't have f11 key
		if( mw.isMobileDevice() ){
			return ;
		}
		// Safari does not have a DOM fullscreen ( no subtitles, no controls )
		if( $.browser.safari && ! /chrome/.test( navigator.userAgent.toLowerCase() ) ){
			return ;
		}

		// OSX has a different short cut than windows and liux
		var toolTipMsg = ( navigator.userAgent.indexOf('Mac OS X') != -1 )?
				gM( 'mwe-embedplayer-fullscreen-tip-osx') :
				gM( 'mwe-embedplayer-fullscreen-tip');

		var $targetTip = this.addWarningBinding( 'EmbedPlayer.FullscreenTip',
			$('<h3/>').html(
				toolTipMsg
			)
		);

		// Display the target warning:
		$targetTip.show();

		var hideTip = function(){
			mw.setConfig('EmbedPlayer.FullscreenTip', false );
			$targetTip.fadeOut('fast');
		};

		// Hide fullscreen tip if:
		// We leave fullscreen,
		$( this.embedPlayer ).bind( 'onCloseFullScreen', hideTip );
		// After 5 seconds,
		setTimeout( hideTip, 5000 );
		// Or if we catch an f11 button press
		$( document ).keyup( function( event ){
			if( event.keyCode == 122 ){
				hideTip();
			}
			return true;
		});
	},

	getWindowOffset: function(){
		var windowOffset = this.embedPlayer.getInterface().offset();
		windowOffset.top = windowOffset.top - $(document).scrollTop();
		windowOffset.left = windowOffset.left - $(document).scrollLeft();
		this.windowOffset = windowOffset;
		return this.windowOffset;
	},

	// TOOD fullscreen iframe vs in page object abstraction
	//( avoid repetitive conditionals in getters )
	// TODO getPlayer size should just return the height of the "video holder"
	getPlayerSize: function(){
		var controlsHeight = ( this.layoutBuilder.isOverlayControls() )? 0 : this.layoutBuilder.getHeight();
		var height = $(window).height() - controlsHeight;
		if( mw.getConfig('EmbedPlayer.IsIframeServer' ) ){
			return {
				'height' : height,
				'width' : $(window).width()
			}
		} else {
			return {
				'height' : this.embedPlayer.getInterface().height(),
				'width' : this.embedPlayer.getInterface().width()
			}
		}
	},
	getFsTarget: function(){
		if( mw.getConfig('EmbedPlayer.IsIframeServer' ) ){
			// For desktops that supports native fullscreen api, give iframe as a target
			var targetId;
			if( window.fullScreenApi.supportsFullScreen ) {
				targetId = this.embedPlayer.id + '_ifp';
			} else {
				// For dom based fullscreen, use iframe container div
				targetId = this.embedPlayer.id;
			}
			return window['parent'].document.getElementById( targetId );
		} else {
			var	$interface = this.embedPlayer.getInterface();
			return $interface[0];
		}
	},
	getDocTarget: function(){
		if( mw.getConfig('EmbedPlayer.IsIframeServer' ) ){
			return window['parent'].document;
		} else {
			return document;
		}
	},
	/**
	* Restore the window player
	*/
	restoreWindowPlayer: function() {
		var _this = this;
		mw.log("PlayerLayoutBuilder :: restoreWindowPlayer" );
		var embedPlayer = this.embedPlayer;

		// Check if fullscreen mode is already restored:
		if( this.isInFullScreen() === false ){
			return ;
		}
		// Set fullscreen mode to false
		this.inFullScreen = false;

		// remove the fullscreen interface
		embedPlayer.getInterface().removeClass( 'fullscreen' );

		// Check for native support for fullscreen and support native fullscreen restore
		if ( window.fullScreenApi.supportsFullScreen ) {
			var fsTarget = this.getFsTarget();
			var docTarget = this.getDocTarget();
			window.fullScreenApi.cancelFullScreen( fsTarget, docTarget );
		}

		// Restore the iFrame context player
		this.restoreContextPlayer();

		// Restore scrolling on iPad
		$( document ).unbind( 'touchend.fullscreen' );

		// Trigger the onCloseFullscreen event:
		$( embedPlayer ).trigger( 'onCloseFullScreen' );
	},
	restoreDomPlayer: function(){
		var _this = this;
		// local ref to embedPlayer:
		var embedPlayer = this.embedPlayer;

		var $interface = embedPlayer.$interface;
		var interfaceHeight = ( _this.isOverlayControls() )
			? embedPlayer.getHeight()
			: embedPlayer.getHeight() + _this.getHeight();

		mw.log( 'restoreWindowPlayer:: h:' + interfaceHeight + ' w:' + embedPlayer.getWidth());
		$('.mw-fullscreen-overlay').remove( 'slow' );

		mw.log( 'restore embedPlayer:: ' + embedPlayer.getWidth() + ' h: ' + embedPlayer.getHeight() );

		// Restore the player:
		embedPlayer.getInterface().css( {
			'width' : _this.preFullscreenPlayerSize.width,
			'height' : _this.preFullscreenPlayerSize.height
		});
		var topPos = {
			'position' : _this.windowPositionStyle,
			'z-index' : _this.windowZindex,
			'overlow' : 'visible',
			'top' : '0px',
			'left' : '0px'
		};
		// Restore non-absolute layout:
		$( [ $interface, $interface.find('.playerPoster'), embedPlayer ] ).css( topPos );
		if( embedPlayer.getPlayerElement() ){
			$( embedPlayer.getPlayerElement() )
				.css( topPos )
		}
		// Restore the body scroll bar
		$('body').css( 'overflow', 'auto' );

		// If native player restore z-index:
		if( embedPlayer.isPersistentNativePlayer() ){
			$( embedPlayer.getPlayerElement() ).css( {
				'z-index': 'auto'
			});
		}
	},

	addFullscreenMouseMoveHideShowControls:function(){
		var _this = this;
		// Bind mouse move in interface to hide control bar
		_this.mouseMovedFlag = false;
		var oldX =0, oldY= 0;
		_this.embedPlayer.getInterface().mousemove( function(e){
			// debounce mouse movements
			if( Math.abs( oldX - event.pageX ) > 4 ||  Math.abs( oldY - event.pageY ) > 4 ){
				_this.mouseMovedFlag = true;
			}
			oldX = event.pageX;
			oldY = event.pageY;
		});

		// Check every 2 seconds reset flag status if controls are overlay
		var checkMovedMouse = function(){
			if( _this.isInFullScreen() ){
				if( _this.mouseMovedFlag ){
					_this.mouseMovedFlag = false;
					_this.showControlBar();
					// Once we move the mouse keep displayed for 4 seconds
					setTimeout( checkMovedMouse, 4000 );
				} else {
					// Check for mouse movement every 250ms
					_this.hideControlBar();
					setTimeout( checkMovedMouse, 250 );
				}
				return;
			}
		};
		// always initially show the control bar:
		_this.showControlBar();
		// start monitoring for moving mouse
		checkMovedMouse();
	},	

};

})( window.mw, window.jQuery );