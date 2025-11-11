# AR.js Gesture Controls & Touch-to-Play Audio Implementation Guide

This guide explains how to implement gesture controls (rotate, zoom) and touch-to-play audio functionality in AR.js applications.

## Features Implemented

1. **Gesture Controls**: Rotate and zoom 3D models using touch gestures
2. **Touch-to-Play Audio**: Play audio when models are touched
3. **Visual Feedback**: Raycast circle indicator showing touch position
4. **Proximity Detection**: Fallback detection method for reliable touch detection

## Prerequisites

- A-Frame 1.4.0 or higher
- AR.js 3.4.5 or higher
- Gesture detection library (`gestures.js`)

## Step 1: Include Required Scripts

Add the gesture library script to your HTML file:

```html
<script src="https://aframe.io/releases/1.4.0/aframe.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.5/aframe/build/aframe-ar.js"></script>
<script src="scripts/gestures.js"></script>
```

Or use the CDN version:
```html
<script src="https://raw.githack.com/fcor/arjs-gestures/master/dist/gestures.js"></script>
```

## Step 2: Add Gesture Detector to Scene

Add the `gesture-detector` component to your `<a-scene>` element:

```html
<a-scene 
    vr-mode-ui="enabled: false;"
    renderer="logarithmicDepthBuffer: true;"
    embedded 
    gesture-detector
    arjs='sourceType: webcam; debugUIEnabled: true; detectionMode: mono_and_matrix; matrixCodeType: 3x3;'>
```

## Step 3: Add Gesture Handler to 3D Models

Add the `gesture-handler` component to any 3D entity you want to control:

```html
<a-marker type='barcode' value='1'>
    <a-box 
        id="box-model" 
        position='0 0.5 0' 
        color="yellow" 
        gesture-handler="minScale: 0.3; maxScale: 8; rotationFactor: 5">
    </a-box>
</a-marker>

<a-marker type='barcode' value='2'>
    <a-entity
        id="animated-model"
        gltf-model="#animated-asset"
        scale="2"
        gesture-handler="minScale: 0.3; maxScale: 8; rotationFactor: 5">
    </a-entity>
</a-marker>
```

### Gesture Handler Properties

- `enabled`: Enable/disable gesture controls (default: `true`)
- `rotationFactor`: Rotation sensitivity (default: `5`)
- `minScale`: Minimum scale factor (default: `0.3`)
- `maxScale`: Maximum scale factor (default: `8`)

## Step 4: Add Visual Touch Indicator (Optional)

Add CSS for the raycast circle indicator:

```html
<style>
#raycast-circle { 
    position: fixed; 
    width: 100px; 
    height: 100px; 
    border: 4px solid #4a9eff; 
    border-radius: 50%; 
    pointer-events: none; 
    z-index: 10000; 
    transform: translate(-50%, -50%); 
    opacity: 1; 
    transition: opacity 0.2s ease, transform 0.1s ease; 
    box-shadow: 0 0 20px rgba(74, 158, 255, 0.6); 
    left: 50%; 
    top: 50%; 
}
#raycast-circle::before { 
    content: ''; 
    position: absolute; 
    top: 50%; 
    left: 50%; 
    transform: translate(-50%, -50%); 
    width: 16px; 
    height: 16px; 
    background: #4a9eff; 
    border-radius: 50%; 
}
</style>
```

Add the circle element to your HTML:

```html
<div id="raycast-circle"></div>
```

## Step 5: Implement Touch-to-Play Audio

### 5.1: Add Audio Elements

```html
<audio id="audio1" src="assets/audio/audio-1.mp3" preload="true" muted></audio>
<audio id="audio2" src="assets/audio/audio-2.mp3" preload="true" muted></audio>
```

**Important**: Audio elements should be muted initially to comply with browser autoplay policies.

### 5.2: Add JavaScript for Touch Detection

Add this script before the closing `</body>` tag:

```javascript
<script>
(function(){
    var scene = document.querySelector('a-scene');
    var boxModel = document.getElementById('box-model');
    var animatedModel = document.getElementById('animated-model');
    var audio1 = document.getElementById('audio1');
    var audio2 = document.getElementById('audio2');
    var marker1 = document.querySelector("a-marker[type='barcode'][value='1']");
    var marker2 = document.querySelector("a-marker[type='barcode'][value='2']");

    // Track marker visibility
    var marker1Visible = false;
    var marker2Visible = false;
    var raycaster = null;
    var camera = null;
    var raycastCircle = document.getElementById('raycast-circle');

    // Function to get canvas dimensions
    function getCanvasSize() {
        var canvas = scene.canvas || (scene.renderer && scene.renderer.domElement);
        if (canvas) {
            var renderer = scene.renderer;
            if (renderer && renderer.getSize) {
                var size = new THREE.Vector2();
                renderer.getSize(size);
                return { width: size.width, height: size.height };
            }
            return { 
                width: canvas.width || canvas.clientWidth || window.innerWidth, 
                height: canvas.height || canvas.clientHeight || window.innerHeight 
            };
        }
        return { width: window.innerWidth, height: window.innerHeight };
    }

    // Function to check which model is touched
    function getTouchedModel(touchX, touchY) {
        if (!raycaster || !camera || !window.THREE) return null;

        var canvasSize = getCanvasSize();
        var canvasWidth = canvasSize.width;
        var canvasHeight = canvasSize.height;

        // Convert touch coordinates to normalized device coordinates
        var mouse = new THREE.Vector2();
        mouse.x = (touchX / canvasWidth) * 2 - 1;
        mouse.y = -(touchY / canvasHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        var ray = raycaster.ray;

        // Collect mesh objects to test
        var objectsToTest = [];
        
        if (boxModel && boxModel.object3D) {
            boxModel.object3D.traverse(function(child) {
                if (child.isMesh || child.isSkinnedMesh) {
                    objectsToTest.push(child);
                }
            });
        }
        
        if (animatedModel && animatedModel.object3D) {
            animatedModel.object3D.traverse(function(child) {
                if (child.isMesh || child.isSkinnedMesh) {
                    objectsToTest.push(child);
                }
            });
        }

        if (objectsToTest.length === 0) return null;

        // Try actual raycast intersection
        raycaster.near = 0.01;
        raycaster.far = 1000;
        var intersects = raycaster.intersectObjects(objectsToTest, true);

        if (intersects.length > 0) {
            var intersectedObject = intersects[0].object;
            var parent = intersectedObject;
            var depth = 0;
            while (parent && depth < 10) {
                if (parent.el) {
                    if (parent.el === boxModel || (marker1 && parent.el === marker1)) {
                        return { model: 'box', intersect: intersects[0] };
                    }
                    if (parent.el === animatedModel || (marker2 && parent.el === marker2)) {
                        return { model: 'animated', intersect: intersects[0] };
                    }
                }
                parent = parent.parent;
                depth++;
            }
        }

        // Fallback: Use proximity/direction check
        if (intersects.length === 0 && objectsToTest.length > 0) {
            var bestMatch = null;
            var bestDot = -1;
            
            objectsToTest.forEach(function(obj) {
                var worldPos = new THREE.Vector3();
                obj.getWorldPosition(worldPos);
                var distance = ray.origin.distanceTo(worldPos);
                var toObject = new THREE.Vector3().subVectors(worldPos, ray.origin).normalize();
                var dot = ray.direction.dot(toObject);
                
                // If ray is pointing at object (dot > 0.7) and within reasonable distance
                if (dot > 0.7 && distance < 10 && dot > bestDot) {
                    bestDot = dot;
                    bestMatch = obj;
                }
            });
            
            if (bestMatch) {
                var parent = bestMatch;
                var depth = 0;
                while (parent && depth < 10) {
                    if (parent.el) {
                        if (parent.el === boxModel || (marker1 && parent.el === marker1)) {
                            return { model: 'box', intersect: null };
                        }
                        if (parent.el === animatedModel || (marker2 && parent.el === marker2)) {
                            return { model: 'animated', intersect: null };
                        }
                    }
                    parent = parent.parent;
                    depth++;
                }
            }
        }

        return null;
    }

    // Function to update raycast circle position
    function updateRaycastCircle(touchX, touchY) {
        if (!raycastCircle) return;
        if (touchX > 0 && touchY > 0) {
            raycastCircle.style.left = touchX + 'px';
            raycastCircle.style.top = touchY + 'px';
        }
    }

    // Function to handle model interaction
    function handleModelInteraction(x, y) {
        var result = getTouchedModel(x, y);

        if (result && result.model === 'box' && audio1 && marker1Visible) {
            try {
                audio1.muted = false;
                audio1.currentTime = 0;
                audio1.play().catch(function(e) {
                    console.warn('Error playing audio1:', e);
                });
            } catch(e) {
                console.warn('Error playing audio1:', e);
            }
        } else if (result && result.model === 'animated' && audio2 && marker2Visible) {
            try {
                audio2.muted = false;
                audio2.currentTime = 0;
                audio2.play().catch(function(e) {
                    console.warn('Error playing audio2:', e);
                });
            } catch(e) {
                console.warn('Error playing audio2:', e);
            }
        }
    }

    // Setup touch handlers
    function setupTouchSoundHandlers() {
        if (window.THREE && scene.object3D) {
            raycaster = new THREE.Raycaster();
            var cameraEl = scene.querySelector('a-entity[camera], a-camera');
            if (cameraEl) {
                if (cameraEl.getObject3D('camera')) {
                    camera = cameraEl.getObject3D('camera');
                } else {
                    cameraEl.addEventListener('componentinitialized', function(e) {
                        if (e.detail.name === 'camera' && cameraEl.getObject3D('camera')) {
                            camera = cameraEl.getObject3D('camera');
                        }
                    });
                }
            }
        }

        // Update circle on touch move
        scene.addEventListener('onefingermove', function(event) {
            if (event.detail && event.detail.positionRaw) {
                updateRaycastCircle(
                    event.detail.positionRaw.x,
                    event.detail.positionRaw.y
                );
            }
        });

        // Handle touch start
        scene.addEventListener('onefingerstart', function(event) {
            if (!event.detail || !event.detail.positionRaw) return;

            updateRaycastCircle(
                event.detail.positionRaw.x,
                event.detail.positionRaw.y
            );

            handleModelInteraction(
                event.detail.positionRaw.x,
                event.detail.positionRaw.y
            );
        });

        // Add click support for desktop
        function setupClickHandler() {
            var canvas = scene.canvas || (scene.renderer && scene.renderer.domElement);
            if (canvas) {
                canvas.addEventListener('click', function(event) {
                    handleModelInteraction(event.clientX, event.clientY);
                });
            } else {
                document.addEventListener('click', function(event) {
                    handleModelInteraction(event.clientX, event.clientY);
                });
            }
        }
        setupClickHandler();
        setTimeout(setupClickHandler, 500);
    }

    // Track marker visibility
    if (marker1) {
        marker1.addEventListener('markerFound', function() {
            marker1Visible = true;
        });
        marker1.addEventListener('markerLost', function() {
            marker1Visible = false;
            if (audio1) {
                audio1.pause();
                audio1.currentTime = 0;
            }
        });
    }

    if (marker2) {
        marker2.addEventListener('markerFound', function() {
            marker2Visible = true;
        });
        marker2.addEventListener('markerLost', function() {
            marker2Visible = false;
            if (audio2) {
                audio2.pause();
                audio2.currentTime = 0;
            }
        });
    }

    // Initialize when scene is loaded
    function onLoaded(){
        setTimeout(function() {
            if (window.THREE && scene.object3D) {
                var cameraEl = scene.querySelector('a-entity[camera], a-camera');
                if (cameraEl) {
                    cameraEl.addEventListener('componentinitialized', function() {
                        if (cameraEl.getObject3D('camera')) {
                            camera = cameraEl.getObject3D('camera');
                            setupTouchSoundHandlers();
                        }
                    });
                    if (cameraEl.getObject3D('camera')) {
                        camera = cameraEl.getObject3D('camera');
                        setupTouchSoundHandlers();
                    }
                } else {
                    setupTouchSoundHandlers();
                }
            } else {
                setupTouchSoundHandlers();
            }
        }, 100);
    }
    
    if (document.readyState === 'complete') onLoaded();
    else window.addEventListener('load', onLoaded);
})();
</script>
```

## How It Works

### Gesture Controls

- **One finger drag**: Rotates the model
- **Two finger pinch**: Zooms the model in/out
- Gestures only work when the marker is detected

### Touch-to-Play Audio

1. When you touch/click on a 3D model, the system performs a raycast from the camera through the touch point
2. If the raycast hits a model, it identifies which model was touched
3. If raycast fails, a proximity check is used as fallback (checks if ray direction points at object)
4. Audio plays only when:
   - A model is successfully detected
   - The corresponding marker is visible
   - Audio element exists and is ready

### Visual Indicator

The raycast circle:
- Always visible on screen
- Follows your finger/cursor
- Provides visual feedback for touch position

## Customization

### Adjust Proximity Detection Threshold

In the `getTouchedModel` function, modify the threshold:

```javascript
// Change from 0.7 to 0.65 for more sensitive detection
if (dot > 0.65 && distance < 10 && dot > bestDot) {
    // ...
}
```

### Change Circle Appearance

Modify the CSS for `#raycast-circle`:
- `width`/`height`: Change circle size
- `border`: Change border color/thickness
- `box-shadow`: Adjust glow effect

### Multiple Audio Files

To add more models with audio:

1. Add audio element: `<audio id="audio3" src="..." muted></audio>`
2. Add model reference: `var model3 = document.getElementById('model3');`
3. Add marker tracking: Similar to marker1/marker2
4. Add to `handleModelInteraction`: Check for `result.model === 'model3'`

## Troubleshooting

### Audio Not Playing

- Ensure audio elements are muted initially
- Check that markers are visible (marker visibility must be true)
- Verify audio file paths are correct
- Check browser console for errors

### Gestures Not Working

- Verify `gesture-detector` is on `<a-scene>`
- Verify `gesture-handler` is on model entities
- Check that `gestures.js` is loaded
- Ensure markers are detected

### Touch Detection Not Working

- Check browser console for errors
- Verify camera and raycaster are initialized
- Ensure models have `id` attributes
- Check that models are visible when markers are detected

## Browser Compatibility

- **Mobile**: Works on iOS Safari, Chrome Android, Firefox Android
- **Desktop**: Works on Chrome, Firefox, Edge, Safari
- **Audio**: Requires user interaction before playing (handled by muted initial state)

## Notes

- Audio must be muted initially to comply with browser autoplay policies
- Touch detection uses a hybrid approach: raycast intersection + proximity fallback
- The proximity check uses a dot product threshold of 0.7 (adjustable)
- Models must be children of markers for proper tracking

## Credits

- Gesture library based on [arjs-gestures](https://github.com/fcor/arjs-gestures) by fcor
- Original gesture detection from 8th Wall's A-Frame examples







