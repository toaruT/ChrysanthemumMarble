/** @file The main file. Everything in the userscript is executed from here.
 * @since 0.0.0
 */

import Overlay from './Overlay.js';
import Observers from './observers.js';
import ApiManager from './apiManager.js';
import TemplateManager from './templateManager.js';
import { consoleLog, consoleWarn } from './utils.js';

const name = GM_info.script.name.toString(); // Name of userscript
const version = GM_info.script.version.toString(); // Version of userscript
const consoleStyle = 'color: black;'; // The styling for the console logs

/** Injects code into the client
 * This code will execute outside of TamperMonkey's sandbox
 * @param {*} callback - The code to execute
 * @since 0.11.15
 */
function inject(callback) {
    const script = document.createElement('script');
    script.setAttribute('bm-name', name); // Passes in the name value
    script.setAttribute('bm-cStyle', consoleStyle); // Passes in the console style value
    script.textContent = `(${callback})();`;
    document.documentElement?.appendChild(script);
    script.remove();
}

/** What code to execute instantly in the client (webpage) to spy on fetch calls.
 * This code will execute outside of TamperMonkey's sandbox.
 * @since 0.11.15
 */
inject(() => {

  const script = document.currentScript; // Gets the current script HTML Script Element
  const name = script?.getAttribute('bm-name') || '菊のマーブル'; // Gets the name value that was passed in. Defaults to "Chrysanthemum Marble" if nothing was found
  const consoleStyle = script?.getAttribute('bm-cStyle') || ''; // Gets the console style value that was passed in. Defaults to no styling if nothing was found
  const fetchedBlobQueue = new Map(); // Blobs being processed

  window.addEventListener('message', (event) => {
    const { source, endpoint, blobID, blobData, blink } = event.data;

    const elapsed = Date.now() - blink;

    // Since this code does not run in the userscript, we can't use consoleLog().
    console.groupCollapsed(`%c${name}%c: ${fetchedBlobQueue.size} Recieved IMAGE message about blob "${blobID}"`, consoleStyle, '');
    console.log(`Blob fetch took %c${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000) % 60).padStart(2,'0')}.${String(elapsed % 1000).padStart(3,'0')}%c MM:SS.mmm`, consoleStyle, '');
    console.log(fetchedBlobQueue);
    console.groupEnd();

    // The modified blob won't have an endpoint, so we ignore any message without one.
    if ((source == 'chrysanthemum-marble') && !!blobID && !!blobData && !endpoint) {

      const callback = fetchedBlobQueue.get(blobID); // Retrieves the blob based on the UUID

      // If the blobID is a valid function...
      if (typeof callback === 'function') {

        callback(blobData); // ...Retrieve the blob data from the blobID function
      } else {
        // ...else the blobID is unexpected. We don't know what it is, but we know for sure it is not a blob. This means we ignore it.

        consoleWarn(`%c${name}%c: Attempted to retrieve a blob (%s) from queue, but the blobID was not a function! Skipping...`, consoleStyle, '', blobID);
      }

      fetchedBlobQueue.delete(blobID); // Delete the blob from the queue, because we don't need to process it again
    }
  });

  // Spys on "spontaneous" fetch requests made by the client
  const originalFetch = window.fetch; // Saves a copy of the original fetch

  // Overrides fetch
  window.fetch = async function(...args) {

    const response = await originalFetch.apply(this, args); // Sends a fetch
    const cloned = response.clone(); // Makes a copy of the response

    // Retrieves the endpoint name. Unknown endpoint = "ignore"
    const endpointName = ((args[0] instanceof Request) ? args[0]?.url : args[0]) || 'ignore';

    // Check Content-Type to only process JSON
    const contentType = cloned.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {


      // Since this code does not run in the userscript, we can't use consoleLog().
      console.log(`%c${name}%c: Sending JSON message about endpoint "${endpointName}"`, consoleStyle, '');

      // Sends a message about the endpoint it spied on
      cloned.json()
        .then(jsonData => {
          window.postMessage({
            source: 'chrysanthemum-marble',
            endpoint: endpointName,
            jsonData: jsonData
          }, '*');
        })
        .catch(err => {
          console.error(`%c${name}%c: Failed to parse JSON: `, consoleStyle, '', err);
        });
    } else if (contentType.includes('image/') && (!endpointName.includes('openfreemap') && !endpointName.includes('maps'))) {
      // Fetch custom for all images but opensourcemap

      const blink = Date.now(); // Current time

      const blob = await cloned.blob(); // The original blob

      // Since this code does not run in the userscript, we can't use consoleLog().
      console.log(`%c${name}%c: ${fetchedBlobQueue.size} Sending IMAGE message about endpoint "${endpointName}"`, consoleStyle, '');

      // Returns the manipulated blob
      return new Promise((resolve) => {
        const blobUUID = crypto.randomUUID(); // Generates a random UUID

        // Store the blob while we wait for processing
        fetchedBlobQueue.set(blobUUID, (blobProcessed) => {
          // The response that triggers when the blob is finished processing

          // Creates a new response
          resolve(new Response(blobProcessed, {
            headers: cloned.headers,
            status: cloned.status,
            statusText: cloned.statusText
          }));

          // Since this code does not run in the userscript, we can't use consoleLog().
          console.log(`%c${name}%c: ${fetchedBlobQueue.size} Processed blob "${blobUUID}"`, consoleStyle, '');
        });

        window.postMessage({
          source: 'chrysanthemum-marble',
          endpoint: endpointName,
          blobID: blobUUID,
          blobData: blob,
          blink: blink
        });
      }).catch(exception => {
        const elapsed = Date.now();
        console.error(`%c${name}%c: Failed to Promise blob!`, consoleStyle, '');
        console.groupCollapsed(`%c${name}%c: Details of failed blob Promise:`, consoleStyle, '');
        console.log(`Endpoint: ${endpointName}\nThere are ${fetchedBlobQueue.size} blobs processing...\nBlink: ${blink.toLocaleString()}\nTime Since Blink: ${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000) % 60).padStart(2,'0')}.${String(elapsed % 1000).padStart(3,'0')} MM:SS.mmm`);
        console.error(`Exception stack:`, exception);
        console.groupEnd();
      });

      // cloned.blob().then(blob => {
      //   window.postMessage({
      //     source: 'chrysanthemum-marble',
      //     endpoint: endpointName,
      //     blobData: blob
      //   }, '*');
      // });
    }

    return response; // Returns the original response
  };
});

// Imports the CSS file from dist folder on github
const cssOverlay = GM_getResourceText("CSS-BM-File");
GM_addStyle(cssOverlay);

// Imports the Roboto Mono font family
var stylesheetLink = document.createElement('link');
stylesheetLink.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap';
stylesheetLink.rel = 'preload';
stylesheetLink.as = 'style';
stylesheetLink.onload = function () {
  this.onload = null;
  this.rel = 'stylesheet';
};
document.head?.appendChild(stylesheetLink);

// CONSTRUCTORS
const observers = new Observers(); // Constructs a new Observers object
const overlayMain = new Overlay(name, version); // Constructs a new Overlay object for the main overlay
const overlayTabTemplate = new Overlay(name, version); // Constructs a Overlay object for the template tab
const templateManager = new TemplateManager(name, version, overlayMain); // Constructs a new TemplateManager object
const apiManager = new ApiManager(templateManager); // Constructs a new ApiManager object

overlayMain.setApiManager(apiManager); // Sets the API manager

const storageTemplates = JSON.parse(GM_getValue('bmTemplates', '{}'));
console.log(storageTemplates);
templateManager.importJSON(storageTemplates); // Loads the templates

buildOverlayMain(); // Builds the main overlay

overlayMain.handleDrag('#bm-overlay', '#bm-bar-drag'); // Creates dragging capability on the drag bar for dragging the overlay

apiManager.spontaneousResponseListener(overlayMain); // Reads spontaneous fetch responces

observeBlack(); // Observes the black palette color

consoleLog(`%c${name}%c (${version}) userscript has loaded!`, 'color: cornflowerblue;', '');

/** Observe the black color, and add the "Move" button.
 * @since 0.66.3
 */
function observeBlack() {
  const observer = new MutationObserver((mutations, observer) => {

    const black = document.querySelector('#color-1'); // Attempt to retrieve the black color element for anchoring

    if (!black) {return;} // Black color does not exist yet. Kills iteself

    let move = document.querySelector('#bm-button-move'); // Tries to find the move button

    // If the move button does not exist, we make a new one
    if (!move) {
      move = document.createElement('button');
      move.id = 'bm-button-move';
      move.textContent = 'Move ↑';
      move.className = 'btn btn-soft';
      move.onclick = function() {
        const roundedBox = this.parentNode.parentNode.parentNode.parentNode; // Obtains the rounded box
        const shouldMoveUp = (this.textContent == 'Move ↑');
        roundedBox.parentNode.className = roundedBox.parentNode.className.replace(shouldMoveUp ? 'bottom' : 'top', shouldMoveUp ? 'top' : 'bottom'); // Moves the rounded box to the top
        roundedBox.style.borderTopLeftRadius = shouldMoveUp ? '0px' : 'var(--radius-box)';
        roundedBox.style.borderTopRightRadius = shouldMoveUp ? '0px' : 'var(--radius-box)';
        roundedBox.style.borderBottomLeftRadius = shouldMoveUp ? 'var(--radius-box)' : '0px';
        roundedBox.style.borderBottomRightRadius = shouldMoveUp ? 'var(--radius-box)' : '0px';
        this.textContent = shouldMoveUp ? 'Move ↓' : 'Move ↑';
      }

      // Attempts to find the "Paint Pixel" element for anchoring
      const paintPixel = black.parentNode.parentNode.parentNode.parentNode.querySelector('h2');

      paintPixel.parentNode?.appendChild(move); // Adds the move button
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/** Deploys the overlay to the page with minimize/maximize functionality.
 * Creates a responsive overlay UI that can toggle between full-featured and minimized states.
 * 
 * Parent/child relationships in the DOM structure below are indicated by indentation.
 * @since 0.58.3
 */
function buildOverlayMain() {
  let isMinimized = false; // Overlay state tracker (false = maximized, true = minimized)
  
  overlayMain.addDiv({'id': 'bm-overlay', 'style': 'top: 10px; right: 75px;'})
    .addDiv({'id': 'bm-contain-header'})
      .addDiv({'id': 'bm-bar-drag'}).buildElement()
      .addImg({'alt': '菊のマーブルアイコン', 'src': 'https://hakko-daiodo.com/kamon-c/cate0/kiku/image/arisugawakiku.png', 'width': '40', 'height': '40',  'style': 'cursor: pointer;'}, 
        (instance, img) => {
          /** Click event handler for overlay minimize/maximize functionality.
           * 
           * Toggles between two distinct UI states:
           * 1. MINIMIZED STATE (60×76px):
           *    - Shows only the Chrysanthemum Marble icon and drag bar
           *    - Hides all input fields, buttons, and status information
           *    - Applies fixed dimensions for consistent appearance
           *    - Repositions icon with 3px right offset for visual centering
           * 
           * 2. MAXIMIZED STATE (responsive):
           *    - Restores full functionality with all UI elements
           *    - Removes fixed dimensions to allow responsive behavior
           *    - Resets icon positioning to default alignment
           *    - Shows success message when returning to maximized state
           * 
           * @param {Event} event - The click event object (implicit)
           */
          img.addEventListener('click', () => {
            isMinimized = !isMinimized; // Toggle the current state

            const overlay = document.querySelector('#bm-overlay');
            const header = document.querySelector('#bm-contain-header');
            const dragBar = document.querySelector('#bm-bar-drag');
            const coordsContainer = document.querySelector('#bm-contain-coords');
            const coordsButton = document.querySelector('#bm-button-coords');
            const createButton = document.querySelector('#bm-button-create');
            const enableButton = document.querySelector('#bm-button-enable');
            const disableButton = document.querySelector('#bm-button-disable');
            const coordInputs = document.querySelectorAll('#bm-contain-coords input');
            
            // Pre-restore original dimensions when switching to maximized state
            // This ensures smooth transition and prevents layout issues
            if (!isMinimized) {
              overlay.style.width = "auto";
              overlay.style.maxWidth = "300px";
              overlay.style.minWidth = "200px";
              overlay.style.padding = "10px";
            }
            
            // Define elements that should be hidden/shown during state transitions
            // Each element is documented with its purpose for maintainability
            const elementsToToggle = [
              '#bm-overlay h1',                    // Main title "Blue Marble"
              '#bm-contain-userinfo',              // User information section (username, droplets, level)
              '#bm-overlay hr',                    // Visual separator lines
              '#bm-contain-automation > *:not(#bm-contain-coords)', // Automation section excluding coordinates
              '#bm-input-file-template',           // Template file upload interface
              '#bm-contain-buttons-action',        // Action buttons container
              '#bm-checkbox', // Text for the checkbox
              `#${instance.outputStatusId}`        // Status log textarea for user feedback
            ];
            
            // Apply visibility changes to all toggleable elements
            elementsToToggle.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                element.style.display = isMinimized ? 'none' : '';
              });
            });
            // Handle coordinate container and button visibility based on state
            if (isMinimized) {
              // ==================== MINIMIZED STATE CONFIGURATION ====================
              // In minimized state, we hide ALL interactive elements except the icon and drag bar
              // This creates a clean, unobtrusive interface that maintains only essential functionality
              
              // Hide coordinate input container completely
              if (coordsContainer) {
                coordsContainer.style.display = 'none';
              }
              
              // Hide coordinate button (pin icon)
              if (coordsButton) {
                coordsButton.style.display = 'none';
              }
              
              // Hide create template button
              if (createButton) {
                createButton.style.display = 'none';
              }

              // Hide enable templates button
              if (enableButton) {
                enableButton.style.display = 'none';
              }

              // Hide disable templates button
              if (disableButton) {
                disableButton.style.display = 'none';
              }
              
              // Hide all coordinate input fields individually (failsafe)
              coordInputs.forEach(input => {
                input.style.display = 'none';
              });
              
              // Apply fixed dimensions for consistent minimized appearance
              // These dimensions were chosen to accommodate the icon while remaining compact
              overlay.style.width = '60px';    // Fixed width for consistency
              overlay.style.height = '76px';   // Fixed height (60px + 16px for better proportions)
              overlay.style.maxWidth = '60px';  // Prevent expansion
              overlay.style.minWidth = '60px';  // Prevent shrinking
              overlay.style.padding = '8px';    // Comfortable padding around icon
              
              // Apply icon positioning for better visual centering in minimized state
              // The 3px offset compensates for visual weight distribution
              img.style.marginLeft = '3px';
              
              // Configure header layout for minimized state
              header.style.textAlign = 'center';
              header.style.margin = '0';
              header.style.marginBottom = '0';
              
              // Ensure drag bar remains visible and properly spaced
              if (dragBar) {
                dragBar.style.display = '';
                dragBar.style.marginBottom = '0.25em';
              }
            } else {
              // ==================== MAXIMIZED STATE RESTORATION ====================
              // In maximized state, we restore all elements to their default functionality
              // This involves clearing all style overrides applied during minimization
              
              // Restore coordinate container to default state
              if (coordsContainer) {
                coordsContainer.style.display = '';           // Show container
                coordsContainer.style.flexDirection = '';     // Reset flex layout
                coordsContainer.style.justifyContent = '';    // Reset alignment
                coordsContainer.style.alignItems = '';        // Reset alignment
                coordsContainer.style.gap = '';               // Reset spacing
                coordsContainer.style.textAlign = '';         // Reset text alignment
                coordsContainer.style.margin = '';            // Reset margins
              }
              
              // Restore coordinate button visibility
              if (coordsButton) {
                coordsButton.style.display = '';
              }
              
              // Restore create button visibility and reset positioning
              if (createButton) {
                createButton.style.display = '';
                createButton.style.marginTop = '';
              }

              // Restore enable button visibility and reset positioning
              if (enableButton) {
                enableButton.style.display = '';
                enableButton.style.marginTop = '';
              }

              // Restore disable button visibility and reset positioning
              if (disableButton) {
                disableButton.style.display = '';
                disableButton.style.marginTop = '';
              }
              
              // Restore all coordinate input fields
              coordInputs.forEach(input => {
                input.style.display = '';
              });
              
              // Reset icon positioning to default (remove minimized state offset)
              img.style.marginLeft = '';
              
              // Restore overlay to responsive dimensions
              overlay.style.padding = '10px';
              
              // Reset header styling to defaults
              header.style.textAlign = '';
              header.style.margin = '';
              header.style.marginBottom = '';
              
              // Reset drag bar spacing
              if (dragBar) {
                dragBar.style.marginBottom = '0.5em';
              }
              
              // Remove all fixed dimensions to allow responsive behavior
              // This ensures the overlay can adapt to content changes
              overlay.style.width = '';
              overlay.style.height = '';
            }
            
            // ==================== ACCESSIBILITY AND USER FEEDBACK ====================
            // Update accessibility information for screen readers and tooltips
            
            // Update alt text to reflect current state for screen readers and tooltips
            img.alt = isMinimized ? 
              '菊のマーブルアイコン - 最小化 (クリックで最大化)' : 
              '菊のマーブルアイコン - 最大化 (クリックで最小化)';
            
            // No status message needed - state change is visually obvious to users
          });
        }
      ).buildElement()
      .addHeader(1, {'textContent': name}).buildElement()
    .buildElement()

    .addHr().buildElement()

    .addDiv({'id': 'bm-contain-userinfo'})
      .addP({'id': 'bm-user-name', 'textContent': 'ユーザー名:'}).buildElement()
      .addP({'id': 'bm-user-droplets', 'textContent': '使用可能ドロップ:'}).buildElement()
      .addP({'id': 'bm-user-nextlevel', 'textContent': '次のレベル...'}).buildElement()
    .buildElement()

    .addHr().buildElement()

    .addDiv({'id': 'bm-contain-automation'})
      // .addCheckbox({'id': 'bm-input-stealth', 'textContent': 'Stealth', 'checked': true}).buildElement()
      // .addButtonHelp({'title': 'Waits for the website to make requests, instead of sending requests.'}).buildElement()
      // .addBr().buildElement()
      // .addCheckbox({'id': 'bm-input-possessed', 'textContent': 'Possessed', 'checked': true}).buildElement()
      // .addButtonHelp({'title': 'Controls the website as if it were possessed.'}).buildElement()
      // .addBr().buildElement()
      .addDiv({'id': 'bm-contain-coords'})
        .addButton({'id': 'bm-button-coords', 'className': 'bm-help', 'style': 'margin-top: 0;', 'innerHTML': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 6"><circle cx="2" cy="2" r="2"></circle><path d="M2 6 L3.7 3 L0.3 3 Z"></path><circle cx="2" cy="2" r="0.7" fill="white"></circle></svg></svg>'},
          (instance, button) => {
            button.onclick = () => {
              const coords = instance.apiManager?.coordsTilePixel; // Retrieves the coords from the API manager
              if (!coords?.[0]) {
                instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?');
                return;
              }
              instance.updateInnerHTML('bm-input-tx', coords?.[0] || '');
              instance.updateInnerHTML('bm-input-ty', coords?.[1] || '');
              instance.updateInnerHTML('bm-input-px', coords?.[2] || '');
              instance.updateInnerHTML('bm-input-py', coords?.[3] || '');
            }
          }
        ).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-tx', 'placeholder': 'Tl X', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-ty', 'placeholder': 'Tl Y', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-px', 'placeholder': 'Px X', 'min': 0, 'max': 999, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-py', 'placeholder': 'Px Y', 'min': 0, 'max': 999, 'step': 1, 'required': true}).buildElement()
      .buildElement()
        .addDiv({'id': 'bm-input-image-toggle-wrap'})
          .addButton({'id': 'bm-input-image-toggle', 'textContent': 'URLで指定'}, (instance, button) => {
            button.onclick = () => {
              const fileWrap = document.querySelector('#bm-input-file-wrap');
              const getcoordsWrap = document.querySelector('#bm-get-coords-from-name');
              const urlWrap = document.querySelector('#bm-input-url-wrap');
              const isFile = fileWrap.style.display !== 'none';
              fileWrap.style.display = isFile ? 'none' : '';
              getcoordsWrap.style.display = isFile ? 'none' : '';
              urlWrap.style.display = isFile ? '' : 'none';
              button.textContent = isFile ? 'ファイルで指定' : 'URLで指定';
            };
          }).buildElement()
        .buildElement()
      .addDiv({'id': 'bm-get-coords-from-name'})
          .addButton({'id': 'bm-get-coords', 'textContent': 'ファイル名から座標を取得'}, (instance, button) => {
            button.onclick = () => {
              let inputFile = document.getElementById('bm-input-file-template');
              let coordFile = inputFile?.files[0];
              let fileName = coordFile?.name.replace(/\.[^/.]+$/, '').split(/\-|\./);
              instance.updateInnerHTML('bm-input-tx', fileName[0] || '');
              instance.updateInnerHTML('bm-input-ty', fileName[1] || '');
              instance.updateInnerHTML('bm-input-px', fileName[2] || '');
              instance.updateInnerHTML('bm-input-py', fileName[3] || '');
            };
          }).buildElement()
        .buildElement()
        
        .addDiv({'id': 'bm-input-file-wrap'})
          .addInputFile({'id': 'bm-input-file-template', 'textContent': '画像ファイルを選択', 'accept': 'image/png, image/jpeg, image/webp, image/bmp, image/gif'}).buildElement()
        .buildElement()
        .addDiv({'id': 'bm-input-url-wrap', 'style': 'display:none;'})
          .addInput({'type': 'text', 'id': 'bm-input-url-template', 'placeholder': '画像URLを入力', 'style': 'width: 100%;'}).buildElement()
        .buildElement()
      .addDiv({'id': 'bm-contain-buttons-template'})

        .addButton({'id': 'bm-button-create', 'textContent': '作成'}, (instance, button) => {
          button.onclick = async () => {
            const inputFile = document.querySelector('#bm-input-file-template');
            const inputUrl = document.querySelector('#bm-input-url-template');
            const coordTlX = document.querySelector('#bm-input-tx');
            if (!coordTlX.checkValidity()) {coordTlX.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordTlY = document.querySelector('#bm-input-ty');
            if (!coordTlY.checkValidity()) {coordTlY.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordPxX = document.querySelector('#bm-input-px');
            if (!coordPxX.checkValidity()) {coordPxX.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordPxY = document.querySelector('#bm-input-py');
            if (!coordPxY.checkValidity()) {coordPxY.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}

            const switchCheckbox = document.querySelector('#bm-checkbox-enable');
            if (switchCheckbox) {
              switchCheckbox.checked = true;
              switchCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            let file = inputFile?.files[0];
            let fileName = file?.name.replace(/\.[^/.]+$/, '');
            // ファイルが未選択ならURL入力を使う
            if (!file && inputUrl?.value) {
              try {
                const res = await fetch(inputUrl.value);
                if (!res.ok) throw new Error('画像の取得に失敗しました');
                const blob = await res.blob();
                file = new File([blob], 'url-image', { type: blob.type });
                fileName = inputUrl.value.split('/').pop()?.split('?')[0] || 'url-image';
              } catch (e) {
                instance.handleDisplayError('画像URLの取得に失敗しました');
                return;
              }
            }
            if (!file) {instance.handleDisplayError(`ファイルまたは画像URLを指定してください`); return;}

            templateManager.createTemplate(
              file,
              fileName,
              [Number(coordTlX.value), Number(coordTlY.value), Number(coordPxX.value), Number(coordPxY.value)]
            );
            instance.handleDisplayStatus(`Drew to canvas!`);
          }
        }).buildElement()
      .buildElement()
      .addTextarea({'id': overlayMain.outputStatusId, 'placeholder': `Status: Sleeping...\nVersion: ${version}`, 'readOnly': true}).buildElement()
      .addDiv({'id': 'bm-contain-buttons-action'})
        .addDiv()
          // .addButton({'id': 'bm-button-teleport', 'className': 'bm-help', 'textContent': '✈'}).buildElement()
          // .addButton({'id': 'bm-button-favorite', 'className': 'bm-help', 'innerHTML': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,2 12,7.5 18,7.5 13.5,11.5 15.5,18 10,14 4.5,18 6.5,11.5 2,7.5 8,7.5" fill="white"></polygon></svg>'}).buildElement()
          // .addButton({'id': 'bm-button-templates', 'className': 'bm-help', 'innerHTML': '🖌'}).buildElement()
          .addButton({'id': 'bm-button-convert', 'className': 'bm-help', 'innerHTML': '🎨', 'title': 'Template Color Converter'}, 
            (instance, button) => {
            button.addEventListener('click', () => {
              window.open('https://pepoafonso.github.io/color_converter_wplace/', '_blank', 'noopener noreferrer');
            });
          }).buildElement()
        .buildElement()
        .addSmall({'textContent': 'Made by 皇居鯖DEVs forked by BlueMarble', 'style': 'margin-top: auto;'}).buildElement()
      .buildElement()
    .buildElement()
  .buildOverlay(document.body);
}

function buildOverlayTabTemplate() {
  overlayTabTemplate.addDiv({'id': 'bm-tab-template', 'style': 'top: 20%; left: 10%;'})
      .addDiv()
        .addDiv({'className': 'bm-dragbar'}).buildElement()
        .addButton({'className': 'bm-button-minimize', 'textContent': '↑'},
          (instance, button) => {
            button.onclick = () => {
              let isMinimized = false;
              if (button.textContent == '↑') {
                button.textContent = '↓';
              } else {
                button.textContent = '↑';
                isMinimized = true;
              }

              
            }
          }
        ).buildElement()
      .buildElement()
    .buildElement()
  .buildOverlay();
}
// --- ここまでがビルダーUI作成部分 ---

setTimeout(() => {
  const container = document.querySelector('#bm-overlay');
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'bm-checkbox';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '0px';
  wrapper.style.marginTop = '0px';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'bm-checkbox-enable';

  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'bm-checkbox-enable';
  toggleLabel.style.userSelect = 'none';

  const textSpan = document.createElement('span');
  textSpan.textContent = '有効化';
  textSpan.style.whiteSpace = 'nowrap';

  // ここでinstanceを定義
  const instance = overlayMain;

  cb.addEventListener('change', () => {
    const enabled = cb.checked;
    console.log(`setTemplatesShouldBeDrawn called with: ${enabled}`);
    instance.apiManager?.templateManager?.setTemplatesShouldBeDrawn(enabled);
    instance.handleDisplayStatus(enabled ? 'Enabled templates!' : 'Disabled templates!');
  });

  const target = document.querySelector('#bm-contain-buttons-template');
  if (target) {
    target.appendChild(wrapper);
  } else {
    container.appendChild(wrapper);
  }

  wrapper.appendChild(cb);
  wrapper.appendChild(toggleLabel);
  wrapper.appendChild(textSpan);
}, 0);
