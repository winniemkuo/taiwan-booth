async function loadModels() {
  try {
    console.log('Loading face detection models...');
    await faceapi.nets.ssdMobilenetv1.loadFromUri('./models/ssd_mobilenetv1');
    console.log('Face detection models loaded successfully');
  } catch (error) {
    console.error('Error loading face detection models:', error);
    alert('Error loading face detection models. Please check the console for details.');
  }
}

async function handlePhotoUpload() {
  try {
    if (!selectedTemplate) {
      alert("Please select a template before uploading a photo.");
      document.getElementById('templateSelector').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }

    console.log('Loading template image...');
    const template = await loadImage(selectedTemplate.background);
    const overlay = selectedTemplate.overlay ? await loadImage(selectedTemplate.overlay) : null;
    const slots = selectedTemplate.slots;

    // Calculate canvas dimensions while maintaining aspect ratio
    const maxWidth = 800;
    const maxHeight = 800;
    const aspectRatio = template.width / template.height;
    let canvasWidth, canvasHeight;

    if (aspectRatio > 1) {
      // Landscape image
      canvasWidth = maxWidth;
      canvasHeight = maxWidth / aspectRatio;
    } else {
      // Portrait or square image
      canvasHeight = maxHeight;
      canvasWidth = maxHeight * aspectRatio;
    }

    // Update canvas dimensions
    const canvas = document.getElementById("finalCanvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");

    // Clear previous content
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('facePreviewContainer').innerHTML = '';

    // Draw template first
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

    const input = document.getElementById("photoInput");
    const file = input.files[0];
    if (!file) {
      alert("Please select a photo first.");
      return;
    }

    console.log('Converting uploaded image...');
    const img = await faceapi.bufferToImage(file);
    
    console.log('Detecting faces...');
    const detections = await faceapi.detectAllFaces(img);
    console.log('Face detections:', detections);

    if (detections.length === 0) {
      alert("No faces detected in the image. Please try another photo.");
      return;
    }

    if (detections.length < slots.length) {
      alert(`This template needs ${slots.length} faces, but only ${detections.length} were detected. Please try another photo.`);
      return;
    }

    // Sort faces from left to right if multiple faces are detected
    if (detections.length > 1) {
      detections.sort((a, b) => a.box.x - b.box.x);
    }

    // Scale slot positions based on new canvas dimensions
    const scaleX = canvas.width / 800;
    const scaleY = canvas.height / 800;

    // Draw cropped faces
    detections.slice(0, slots.length).forEach((det, i) => {
      console.log(`Processing face ${i + 1}:`, det);
      const { x, y, width, height } = det.box;
      
      // Expand the crop area around the face
      const expandX = width * 0.1; 
      const expandY = height * 0.2;
      
      const cropX = Math.max(0, x - expandX);
      const cropY = Math.max(0, y - expandY);
      const cropWidth = Math.min(img.width - cropX, width + (expandX * 2));
      const cropHeight = Math.min(img.height - cropY, height + (expandY * 2));
      
      // Use expanded crop area
      const crop = cropImage(img, cropX, cropY, cropWidth, cropHeight);

      // Get target slot from template
      const slot = slots[i];
      
      // Calculate dimensions that maintain aspect ratio
      const cropAspectRatio = cropWidth / cropHeight;
      const slotAspectRatio = slot.width / slot.height;
      
      let drawWidth, drawHeight, drawX, drawY;
      
      if (cropAspectRatio > slotAspectRatio) {
        // Crop is wider than slot, fit to height
        drawHeight = slot.height;
        drawWidth = drawHeight * cropAspectRatio;
        drawX = slot.x + (slot.width - drawWidth) / 2;
        drawY = slot.y;
      } else {
        // Crop is taller than slot, fit to width
        drawWidth = slot.width;
        drawHeight = drawWidth / cropAspectRatio;
        drawX = slot.x;
        drawY = slot.y + (slot.height - drawHeight) / 2;
      }

      // Draw mask based on whether the slot is circular or oval
      ctx.save();
      ctx.beginPath();
      const centerX = slot.x + slot.width / 2;
      const centerY = slot.y + slot.height / 2;
      
      if (slot.width === slot.height) {
        // Use circle for equal width/height
        const radius = slot.width / 2;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      } else {
        // Use oval for different width/height
        const radiusX = slot.width / 2;
        const radiusY = slot.height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      }
      
      ctx.closePath();
      ctx.clip();

      // Draw the face maintaining aspect ratio
      ctx.drawImage(crop, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();

      // Face preview - use same shape as main image
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = slot.width;
      previewCanvas.height = slot.height;
      const previewCtx = previewCanvas.getContext('2d');
      
      // Create mask for preview using same shape
      previewCtx.save();
      previewCtx.beginPath();
      
      if (slot.width === slot.height) {
        // Use circle for equal width/height
        const radius = slot.width / 2;
        previewCtx.arc(
          slot.width / 2,
          slot.height / 2,
          radius,
          0,
          Math.PI * 2
        );
      } else {
        // Use oval for different width/height
        previewCtx.ellipse(
          slot.width / 2,
          slot.height / 2,
          slot.width / 2,
          slot.height / 2,
          0,
          0,
          Math.PI * 2
        );
      }
      
      previewCtx.closePath();
      previewCtx.clip();
      
      // Draw the face in preview maintaining aspect ratio
      if (cropAspectRatio > 1) {
        previewDrawHeight = slot.height;
        previewDrawWidth = previewDrawHeight * cropAspectRatio;
        previewDrawX = (slot.width - previewDrawWidth) / 2;
        previewDrawY = 0;
      } else {
        previewDrawWidth = slot.width;
        previewDrawHeight = previewDrawWidth / cropAspectRatio;
        previewDrawX = 0;
        previewDrawY = (slot.height - previewDrawHeight) / 2;
      }
      
      previewCtx.drawImage(crop, previewDrawX, previewDrawY, previewDrawWidth, previewDrawHeight);
      previewCtx.restore();
      
      document.getElementById('facePreviewContainer').appendChild(previewCanvas);
    });

    // Add event title at top
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    
    // Set text rendering for smoother outlines
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    
    // Create thinner outline effect
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(document.getElementById("eventTitle").value, canvas.width / 2, 40);
    
    // Draw the white text
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 2;
    ctx.fillText(document.getElementById("eventTitle").value, canvas.width / 2, 40);

    // Draw custom bottom caption with same effect
    const captionText = document.getElementById("bottomText").value;
    ctx.font = "20px sans-serif";
    
    // Create outline effect for caption
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeText(captionText, canvas.width / 2, canvas.height - 40);
    
    // Draw the white text
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(captionText, canvas.width / 2, canvas.height - 40);

    // After successful face detection and processing
    document.querySelector('.preview-section').scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });

  } catch (error) {
    console.error('Error processing photo:', error);
    alert('Error processing photo. Please check the console for details.');
  }
}

function cropImage(sourceImage, x, y, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceImage, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = src;
  });
}

let selectedTemplate = null;
let templateData = [];

async function loadTemplates() {
  const res = await fetch('templates.json');
  templateData = await res.json();
  const container = document.getElementById('templateSelector');

  templateData.forEach((template) => {
    const tile = document.createElement('div');
    tile.style.border = '2px solid transparent';
    tile.style.cursor = 'pointer';
    tile.style.margin = '1px';
    tile.style.textAlign = 'center';
    tile.style.width = '100px';

    const img = document.createElement('img');
    img.src = template.thumbnail;
    img.alt = template.label;
    img.style.width = '100%';
    img.style.height = '100px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '6px';
    img.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';

    const label = document.createElement('div');
    label.innerText = template.label;
    label.style.textAlign = 'center';
    label.style.marginTop = '2px';
    label.style.marginBottom = '2px';
    label.style.fontSize = '11px';
    label.style.fontWeight = '500';
    label.style.color = '#444';

    tile.appendChild(img);
    tile.appendChild(label);

    tile.onclick = () => {
      selectedTemplate = template;
      clearCanvasAndPreview();
      document.getElementById("photoInput").value = "";
      [...container.children].forEach(c => c.style.border = '2px solid transparent');
      tile.style.border = '2px solid #4CAF50';
      
      // Scroll to the input section after template selection
      document.querySelector('.input-group').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    };

    container.appendChild(tile);
  });
}

function clearCanvasAndPreview() {
  const canvas = document.getElementById("finalCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById("facePreviewContainer").innerHTML = '';
}

function refreshTextOnly() {
  const canvas = document.getElementById("finalCanvas");
  const ctx = canvas.getContext("2d");

  // Get current image data
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw text again
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 2;

    const title = document.getElementById("eventTitle").value;
    ctx.fillText(title, canvas.width / 2, 40);

    const caption = document.getElementById("bottomText").value;
    ctx.font = "20px sans-serif";
    ctx.fillText(caption, canvas.width / 2, canvas.height - 40);

    // Scroll to preview after text changes
    document.querySelector('.preview-section').scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  };

  // Get current canvas image as source
  img.src = canvas.toDataURL("image/png");
}

document.getElementById("photoInput").addEventListener("change", handlePhotoUpload);
document.getElementById("finalCanvas").scrollIntoView({ behavior: "smooth" });
document.getElementById("eventTitle").addEventListener("input", debounce(refreshTextOnly, 500));
document.getElementById("bottomText").addEventListener("input", debounce(refreshTextOnly, 500));
loadModels();
loadTemplates();

// Debounce function to prevent too frequent scrolling
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};
