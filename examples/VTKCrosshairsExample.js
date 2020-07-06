import React from 'react';
import { Component } from 'react';
import axios from 'axios';
import {
  View2D,
  View3D,
  getImageData,
  loadImageData,
  vtkInteractorStyleMPRCrosshairs,
  vtkSVGCrosshairsWidget,
} from '@vtk-viewport';
import CornerstoneViewport from 'react-cornerstone-viewport';
import { api as dicomwebClientApi } from 'dicomweb-client';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import presets from './presets.js';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkHttpDataSetReader from 'vtk.js/Sources/IO/Core/HttpDataSetReader';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import './initCornerstone.js';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';

window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

const url = 'http://localhost:8080/dcm4chee-arc/aets/DCM4CHEE/rs';
const urlPageString = window.location.href
const formatUrl = new URL(urlPageString);
const studyUid = formatUrl.searchParams.get("studyUid")
const serieUid = formatUrl.searchParams.get("serieUid")

const studyInstanceUID = studyUid
const ctSeriesInstanceUID = serieUid
const searchInstanceOptions = {
  studyInstanceUID,
};

// const { EVENTS } = cornerstoneTools;
// window.cornerstoneTools = cornerstoneTools;
// const segmentationModule = cornerstoneTools.getModule('segmentation');

function createActorMapper(imageData) {
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);

  return {
    actor,
    mapper,
  };
}

function getShiftRange(colorTransferArray) {
  // Credit to paraview-glance
  // https://github.com/Kitware/paraview-glance/blob/3fec8eeff31e9c19ad5b6bff8e7159bd745e2ba9/src/components/controls/ColorBy/script.js#L133

  // shift range is original rgb/opacity range centered around 0
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < colorTransferArray.length; i += 4) {
    min = Math.min(min, colorTransferArray[i]);
    max = Math.max(max, colorTransferArray[i]);
  }

  const center = (max - min) / 2;

  return {
    shiftRange: [-center, center],
    min,
    max,
  };
}

function applyPointsToPiecewiseFunction(points, range, pwf) {
  const width = range[1] - range[0];
  const rescaled = points.map(([x, y]) => [x * width + range[0], y]);

  pwf.removeAllPoints();
  rescaled.forEach(([x, y]) => pwf.addPoint(x, y));

  return rescaled;
}

function applyPointsToRGBFunction(points, range, cfun) {
  const width = range[1] - range[0];
  const rescaled = points.map(([x, r, g, b]) => [
    x * width + range[0],
    r,
    g,
    b,
  ]);

  cfun.removeAllPoints();
  rescaled.forEach(([x, r, g, b]) => cfun.addRGBPoint(x, r, g, b));

  return rescaled;
}

function applyPreset(actor, preset) {
  // Create color transfer function
  const colorTransferArray = preset.colorTransfer
    .split(' ')
    .splice(1)
    .map(parseFloat);

  const { shiftRange } = getShiftRange(colorTransferArray);
  let min = shiftRange[0];
  const width = shiftRange[1] - shiftRange[0];
  const cfun = vtkColorTransferFunction.newInstance();
  const normColorTransferValuePoints = [];
  for (let i = 0; i < colorTransferArray.length; i += 4) {
    let value = colorTransferArray[i];
    const r = colorTransferArray[i + 1];
    const g = colorTransferArray[i + 2];
    const b = colorTransferArray[i + 3];

    value = (value - min) / width;
    normColorTransferValuePoints.push([value, r, g, b]);
  }

  applyPointsToRGBFunction(normColorTransferValuePoints, shiftRange, cfun);

  actor.getProperty().setRGBTransferFunction(0, cfun);

  // Create scalar opacity function
  const scalarOpacityArray = preset.scalarOpacity
    .split(' ')
    .splice(1)
    .map(parseFloat);

  const ofun = vtkPiecewiseFunction.newInstance();
  const normPoints = [];
  for (let i = 0; i < scalarOpacityArray.length; i += 2) {
    let value = scalarOpacityArray[i];
    const opacity = scalarOpacityArray[i + 1];

    value = (value - min) / width;

    normPoints.push([value, opacity]);
  }

  applyPointsToPiecewiseFunction(normPoints, shiftRange, ofun);

  actor.getProperty().setScalarOpacity(0, ofun);

  const [
    gradientMinValue,
    gradientMinOpacity,
    gradientMaxValue,
    gradientMaxOpacity,
  ] = preset.gradientOpacity
    .split(' ')
    .splice(1)
    .map(parseFloat);

  actor.getProperty().setUseGradientOpacity(0, true);
  actor.getProperty().setGradientOpacityMinimumValue(0, gradientMinValue);
  actor.getProperty().setGradientOpacityMinimumOpacity(0, gradientMinOpacity);
  actor.getProperty().setGradientOpacityMaximumValue(0, gradientMaxValue);
  actor.getProperty().setGradientOpacityMaximumOpacity(0, gradientMaxOpacity);

  if (preset.interpolation === '1') {
    actor.getProperty().setInterpolationTypeToFastLinear();
    //actor.getProperty().setInterpolationTypeToLinear()
  }

  const ambient = parseFloat(preset.ambient);
  //const shade = preset.shade === '1'
  const diffuse = parseFloat(preset.diffuse);
  const specular = parseFloat(preset.specular);
  const specularPower = parseFloat(preset.specularPower);

  //actor.getProperty().setShade(shade)
  actor.getProperty().setAmbient(ambient);
  actor.getProperty().setDiffuse(diffuse);
  actor.getProperty().setSpecular(specular);
  actor.getProperty().setSpecularPower(specularPower);
}

function createCT3dPipeline(imageData, ctTransferFunctionPresetId) {
  const { actor, mapper } = createActorMapper(imageData);

  const sampleDistance =
    1.2 *
    Math.sqrt(
      imageData
        .getSpacing()
        .map(v => v * v)
        .reduce((a, b) => a + b, 0)
    );

  const range = imageData
    .getPointData()
    .getScalars()
    .getRange();
  actor
    .getProperty()
    .getRGBTransferFunction(0)
    .setRange(range[0], range[1]);

  mapper.setSampleDistance(sampleDistance);

  const preset = presets.find(
    preset => preset.id === ctTransferFunctionPresetId
  );

  applyPreset(actor, preset);

  actor.getProperty().setScalarOpacityUnitDistance(0, 2.5);

  return actor;
}

function createStudyImageIds(baseUrl, studySearchOptions) {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';

  const client = new dicomwebClientApi.DICOMwebClient({ url });

  return new Promise((resolve, reject) => {
    client.retrieveStudyMetadata(studySearchOptions).then(instances => {
      const imageIds = instances.map(metaData => {
        const imageId =
          `wadors:` +
          baseUrl +
          '/studies/' +
          studyInstanceUID +
          '/series/' +
          metaData[SERIES_INSTANCE_UID].Value[0] +
          '/instances/' +
          metaData[SOP_INSTANCE_UID].Value[0] +
          '/frames/1';

        cornerstoneWADOImageLoader.wadors.metaDataManager.add(
          imageId,
          metaData
        );

        return imageId;
      });

      resolve(imageIds);
    }, reject);
  });
}

// const voi = {
//   windowCenter: 35,
//   windowWidth: 80,
// };

// function setupSyncedBrush(imageDataObject) {
//   // Create buffer the size of the 3D volume
//   const dimensions = imageDataObject.dimensions;
//   const width = dimensions[0];
//   const height = dimensions[1];
//   const depth = dimensions[2];
//   const numVolumePixels = width * height * depth;

//   // If you want to load a segmentation labelmap, you would want to load
//   // it into this array at this point.
//   const threeDimensionalPixelData = new Float32Array(numVolumePixels);

//   const buffer = threeDimensionalPixelData.buffer;
//   const imageIds = imageDataObject.imageIds;
//   const numberOfFrames = imageIds.length;

//   if (numberOfFrames !== depth) {
//     throw new Error('Depth should match the number of imageIds');
//   }

//   // Use Float32Arrays in cornerstoneTools for interoperability.
//   segmentationModule.configuration.arrayType = 1;

//   segmentationModule.setters.labelmap3DByFirstImageId(
//     imageIds[0],
//     buffer,
//     0,
//     [],
//     numberOfFrames,
//     undefined,
//     0
//   );

//   // Create VTK Image Data with buffer as input
//   const labelMap = vtkImageData.newInstance();

//   // right now only support 256 labels
//   const dataArray = vtkDataArray.newInstance({
//     numberOfComponents: 1, // labelmap with single component
//     values: threeDimensionalPixelData,
//   });

//   labelMap.getPointData().setScalars(dataArray);
//   labelMap.setDimensions(...dimensions);
//   labelMap.setSpacing(...imageDataObject.vtkImageData.getSpacing());
//   labelMap.setOrigin(...imageDataObject.vtkImageData.getOrigin());
//   labelMap.setDirection(...imageDataObject.vtkImageData.getDirection());

//   return labelMap;
// }

// const ROOT_URL =
//   window.location.hostname === 'localhost'
//     ? window.location.host
//     : window.location.hostname;

// const imageIds2 = [
//   `dicomweb://${ROOT_URL}/PTCTStudy/1.3.6.1.4.1.25403.52237031786.3872.20100510032221.1.dcm`,
//   `dicomweb://${ROOT_URL}/PTCTStudy/1.3.6.1.4.1.25403.52237031786.3872.20100510032221.2.dcm`,
//   `dicomweb://${ROOT_URL}/PTCTStudy/1.3.6.1.4.1.25403.52237031786.3872.20100510032221.3.dcm`,
//   `dicomweb://${ROOT_URL}/PTCTStudy/1.3.6.1.4.1.25403.52237031786.3872.20100510032221.4.dcm`,
//   `dicomweb://${ROOT_URL}/PTCTStudy/1.3.6.1.4.1.25403.52237031786.3872.20100510032221.5.dcm`,
// ];

function createLabelMapImageData(backgroundImageData) {
  const labelMapData = vtkImageData.newInstance(
    backgroundImageData.get('spacing', 'origin', 'direction')
  );
  labelMapData.setDimensions(backgroundImageData.getDimensions());
  labelMapData.computeTransforms();

  const values = new Float32Array(backgroundImageData.getNumberOfPoints());
  const dataArray = vtkDataArray.newInstance({
    numberOfComponents: 1, // labelmap with single component
    values,
  });
  labelMapData.getPointData().setScalars(dataArray);

  return labelMapData;
}

function createVolumeRenderingActor(imageData) {
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);

  const rgbTransferFunction = actor.getProperty().getRGBTransferFunction(0);
  const range = imageData
    .getPointData()
    .getScalars()
    .getRange();
  rgbTransferFunction.setMappingRange(range[0], range[1]);

  // create color and opacity transfer functions
  const cfun = vtkColorTransferFunction.newInstance();
  cfun.addRGBPoint(range[0], 0.4, 0.2, 0.0);
  cfun.addRGBPoint(range[1], 1.0, 1.0, 1.0);

  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0.0, 0.0);
  ofun.addPoint(1000.0, 0.3);
  ofun.addPoint(6000.0, 0.9);

  actor.getProperty().setRGBTransferFunction(0, cfun);
  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setScalarOpacityUnitDistance(0, 4.5);
  actor.getProperty().setInterpolationTypeToLinear();
  actor.getProperty().setUseGradientOpacity(0, true);
  actor.getProperty().setGradientOpacityMinimumValue(0, 15);
  actor.getProperty().setGradientOpacityMinimumOpacity(0, 0.0);
  actor.getProperty().setGradientOpacityMaximumValue(0, 100);
  actor.getProperty().setGradientOpacityMaximumOpacity(0, 1.0);
  actor.getProperty().setAmbient(0.7);
  actor.getProperty().setDiffuse(0.7);
  actor.getProperty().setSpecular(0.3);
  actor.getProperty().setSpecularPower(8.0);

  return actor;
}

class VTKCrosshairsExample extends Component {
  state = {
    volumes: [],
    displayCrosshairs: true,
    volumeRenderingVolumes: null,
    ctTransferFunctionPresetId: 'vtkMRMLVolumePropertyNode4',
    petColorMapId: 'hsv',
    cornerstoneViewportData: null,
    focusedWidgetId: "PaintWidget",
    isSetup: false,
    activeToolName: 'Brush',
    paintFilterBackgroundImageData: null,
    paintFilterLabelMapImageData: null,
    threshold: 10,
  };

  async componentDidMount() {
    this.apis = [];
    this.apisVolum3D = [];
    this.apiBrush = [];
    this.cornerstoneElements = {};

    const imageIds = await createStudyImageIds(url, searchInstanceOptions);

    let ctImageIds = imageIds.filter(imageId =>
      imageId.includes(ctSeriesInstanceUID)
    );

    const ctImageDataObject = this.loadDataset(ctImageIds, 'ctDisplaySet');

    const ctImageData = ctImageDataObject.vtkImageData;
    const ctVolVR = createCT3dPipeline(
      ctImageData,
      this.state.ctTransferFunctionPresetId
    );

    // const promises = imageIds2.map(imageId => {
    //   return cornerstone.loadAndCacheImage(imageId);
    // });

    this.setState({
      volumeRenderingVolumes: [ctVolVR],
      percentComplete: 0,
    });

    Promise.all(ctImageDataObject.insertPixelDataPromises).then(() => {
      const ctImageData = ctImageDataObject.vtkImageData;

      const range = ctImageData
        .getPointData()
        .getScalars()
        .getRange();

      const ctVol = vtkVolume.newInstance();
      const mapper = vtkVolumeMapper.newInstance();

      ctVol.setMapper(mapper);
      mapper.setInputData(ctImageData);

      const rgbTransferFunction = ctVol.getProperty().getRGBTransferFunction(0);
      rgbTransferFunction.setMappingRange(500, 3000);
      rgbTransferFunction.setRange(range[0], range[1]);

      // mapper.setMaximumSamplesPerRay(2000);
      const labelMapImageData = createLabelMapImageData(ctImageData);
      const volumeRenderingActor = createVolumeRenderingActor(ctImageData);

      this.setState({
        volumes: [ctVol],
        volumeRenderingVolumes: [volumeRenderingActor],
        paintFilterBackgroundImageData: ctImageData,
        paintFilterLabelMapImageData: labelMapImageData,
      });
    });

    // Promise.all(promises).then(() => {
    //   const displaySetInstanceUid = '12345';
    //   const cornerstoneViewportData = {
    //     stack: {
    //       imageIds: imageIds2,
    //       currentImageIdIndex: 0,
    //     },
    //     displaySetInstanceUid,
    //   };

    //   const imageDataObject = getImageData(imageIds2, displaySetInstanceUid);
    //   const labelMapInputData = setupSyncedBrush(imageDataObject);
    //   this.onMeasurementsChanged = event => {

    //     if (event.type !== EVENTS.LABELMAP_MODIFIED) {
    //       return;
    //     }

    //     labelMapInputData.modified();

    //     this.rerenderAll();
    //   };

    //   loadImageData(imageDataObject);
    //   Promise.all(imageDataObject.insertPixelDataPromises).then(() => {
    //     const { actor } = createActorMapper(imageDataObject.vtkImageData);
    //     const rgbTransferFunction = actor
    //       .getProperty()
    //       .getRGBTransferFunction(0);

    //     const low = voi.windowCenter - voi.windowWidth / 2;
    //     const high = voi.windowCenter + voi.windowWidth / 2;

    //     rgbTransferFunction.setMappingRange(low, high);

    //     this.setState({
    //       vtkImageData: imageDataObject.vtkImageData,
    //       volumes: [actor],
    //       cornerstoneViewportData: cornerstoneViewportData,
    //       labelMapInputData,
    //       colorLUT: segmentationModule.getters.colorLUT(0),
    //       globalOpacity: segmentationModule.configuration.fillAlpha,
    //       outlineThickness: segmentationModule.configuration.outlineThickness,
    //     });
    //   });
    // });
  }

  // onPaintEnd = strokeBuffer => {
  //   const element = this.cornerstoneElements[0];
  //   const enabledElement = cornerstone.getEnabledElement(element);
  //   const { getters, setters } = cornerstoneTools.getModule('segmentation');
  //   const labelmap3D = getters.labelmap3D(element);
  //   const stackState = cornerstoneTools.getToolState(element, 'stack');
  //   const { rows, columns } = enabledElement.image;

  //   if (!stackState || !labelmap3D) {
  //     return;
  //   }

  //   const stackData = stackState.data[0];
  //   const numberOfFrames = stackData.imageIds.length;
  //   const segmentIndex = labelmap3D.activeSegmentIndex;

  //   for (let i = 0; i < numberOfFrames; i++) {
  //     let labelmap2D = labelmap3D.labelmaps2D[i];

  //     if (labelmap2D && labelmap2D.segmentsOnLabelmap.includes(segmentIndex)) {
  //       continue;
  //     }

  //     const frameLength = rows * columns;
  //     const byteOffset = frameLength * i;
  //     const strokeArray = new Uint8Array(strokeBuffer, byteOffset, frameLength);

  //     const strokeOnFrame = strokeArray.some(element => element === 1);

  //     if (!strokeOnFrame) {
  //       continue;
  //     }

  //     if (labelmap2D) {
  //       labelmap2D.segmentsOnLabelmap.push(segmentIndex);
  //     } else {
  //       labelmap2D = getters.labelmap2DByImageIdIndex(
  //         labelmap3D,
  //         i,
  //         rows,
  //         columns
  //       );
  //     }
  //   }

  //   cornerstone.updateImage(element);
  // };

  saveApiReference = api => {
    this.apisVolum3D = [api];
    this.apiBrush = [api]
  };

  handleChangeCTTransferFunction = event => {
    const ctTransferFunctionPresetId = event.target.value;
    const preset = presets.find(
      preset => preset.id === ctTransferFunctionPresetId
    );

    const actor = this.state.volumeRenderingVolumes[0];

    applyPreset(actor, preset);

    this.rerenderAll();

    this.setState({
      ctTransferFunctionPresetId,
    });
  };

  rerenderAll = () => {
    // Update all render windows, since the automatic re-render might not
    // happen if the viewport is not currently using the painting widget
    // Object.keys(this.apiBrush).forEach(viewportIndex => {
    //   const renderWindow = this.apiBrush[
    //     viewportIndex
    //   ].genericRenderWindow.getRenderWindow();

    //   renderWindow.render();
    // });

    Object.keys(this.apisVolum3D).forEach(viewportIndex => {
      const renderWindow = this.apisVolum3D[
        viewportIndex
      ].genericRenderWindow.getRenderWindow();

      renderWindow.render();
    });
  };

  // saveCornerstoneElements = viewportIndex => {
  //   return event => {
  //     this.cornerstoneElements[viewportIndex] = event.detail.element;
  //   };
  // };

  storeApi = viewportIndex => {
    return api => {
      this.apis[viewportIndex] = api;

      const apis = this.apis;
      const renderWindow = api.genericRenderWindow.getRenderWindow();

      // Add svg widget
      api.addSVGWidget(
        vtkSVGCrosshairsWidget.newInstance(),
        'crosshairsWidget'
      );

      const istyle = vtkInteractorStyleMPRCrosshairs.newInstance();

      // add istyle
      api.setInteractorStyle({
        istyle,
        configuration: { apis, apiIndex: viewportIndex },
      });

      // set blend mode to MIP.
      const mapper = api.volumes[0].getMapper();
      if (mapper.setBlendModeToMaximumIntensity) {
        mapper.setBlendModeToMaximumIntensity();
      }

      api.setSlabThickness(0.1);

      renderWindow.render();

      // Its up to the layout manager of an app to know how many viewports are being created.
      if (apis[0] && apis[1] && apis[2]) {
        //const api = apis[0];

        const api = apis[0];

        api.svgWidgets.crosshairsWidget.resetCrosshairs(apis, 0);
      }
    };
  };

  handleSlabThicknessChange(evt) {
    const value = evt.target.value;
    const valueInMM = value / 10;
    const apis = this.apis;

    apis.forEach(api => {
      const renderWindow = api.genericRenderWindow.getRenderWindow();

      api.setSlabThickness(valueInMM);
      renderWindow.render();
    });
  }

  toggleCrosshairs = () => {
    const { displayCrosshairs } = this.state;
    const apis = this.apis;

    const shouldDisplayCrosshairs = !displayCrosshairs;

    apis.forEach(api => {
      const { svgWidgetManager, svgWidgets } = api;
      svgWidgets.crosshairsWidget.setDisplay(shouldDisplayCrosshairs);

      svgWidgetManager.render();
    });

    this.setState({ displayCrosshairs: shouldDisplayCrosshairs });
  };

  loadDataset(imageIds, displaySetInstanceUid) {
    const imageDataObject = getImageData(imageIds, displaySetInstanceUid);

    loadImageData(imageDataObject);

    const { insertPixelDataPromises } = imageDataObject;

    const numberOfFrames = insertPixelDataPromises.length;

    // TODO -> Maybe the component itself should do this.
    insertPixelDataPromises.forEach(promise => {
      promise.then(numberProcessed => {
        const percentComplete = Math.floor(
          (numberProcessed * 100) / numberOfFrames
        );

        if (this.state.percentComplete !== percentComplete) {
          this.setState({ percentComplete });
        }

        if (percentComplete % 20 === 0) {
          this.rerenderAll();
        }
      });
    });

    Promise.all(insertPixelDataPromises).then(() => {
      this.rerenderAll();
    });

    return imageDataObject;
  }

  handleActiveTool = tool => {
    this.setState({ activeToolName: tool })
  };

  render() {
    if (
      !this.state.volumes ||
      !this.state.volumes.length ||
      !this.state.volumeRenderingVolumes
    ) {
      return <h4>Loading...</h4>;
    }


    const ctTransferFunctionPresetOptions = presets.map(preset => {
      return (
        <option key={preset.id} value={preset.id}>
          {preset.name}
        </option>
      );
    });

    const { percentComplete } = this.state;

    const progressString = `Progress: ${percentComplete}%`;

    return (
      <div>
        <div className="row">
          <div className="col-xs-4">
            <label htmlFor="set-slab-thickness">SlabThickness: </label>
            <input
              id="set-slab-thickness"
              type="range"
              name="points"
              min="1"
              max="5000"
              onChange={this.handleSlabThicknessChange.bind(this)}
            />
            <p>Toggle crosshairs on/off.</p>
            <button onClick={this.toggleCrosshairs}>
              {this.state.displayCrosshairs
                ? 'Hide Crosshairs'
                : 'Show Crosshairs'}
            </button>
          </div>
        </div>
        <div className="row">
          <div className="col-xs-4">
            <div>
              <label htmlFor="select_CT_xfer_fn">
                CT Transfer Function Preset (for Volume Rendering):{' '}
              </label>
              <div>
                <select
                  id="select_CT_xfer_fn"
                  value={this.state.ctTransferFunctionPresetId}
                  onChange={this.handleChangeCTTransferFunction}
                >
                  {ctTransferFunctionPresetOptions}
                </select>
                <div>-- Volums render: <h5>{progressString}</h5></div>
              </div>
            </div>
          </div>
          <hr />
        </div>

        {/* <div className="row" style={{ marginBottom: '15px' }}>
          <div className="col-xs-12">
            <button type="button" className="btn btn-warning" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Brush')}>Brush</button>
            <button type="button" className="btn btn-primary" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Length')}>Length</button>
            <button type="button" className="btn btn-warning" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Angle')}>Angle</button>
            <button type="button" className="btn btn-success" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Bidirectional')}>Bidirectional</button>
            <button type="button" className="btn btn-danger" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('FreehandRoi')}>FreehandRoi</button>
            <button type="button" className="btn btn-warning" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Eraser')}>Eraser</button>
            <button type="button" className="btn btn-info" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('CircleScissors')}>CircleScissors</button>
            <button type="button" className="btn btn-danger" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('RectangleScissors')}>RectangleScissors</button>
            <button type="button" className="btn btn-danger" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('FreehandScissors')}>Freehand Scissors</button>
            <button type="button" className="btn btn-danger" style={{ marginRight: '6px' }} onClick={() => this.handleActiveTool('Magnify')}>Magnify</button>
          </div>
        </div> */}

        <div className="row" style={{ marginBottom: '30px' }}>
          {/* <div className="col-xs-4" style={{ height: '360px' }}>
            <span className="label label-default">Test brush tool</span>
            {this.state.cornerstoneViewportData && (
              <CornerstoneViewport
                activeTool={this.state.activeToolName}
                availableTools={[
                  { name: 'Brush' },
                  { name: 'Length' },
                  { name: 'Angle' },
                  { name: 'Bidirectional' },
                  { name: 'FreehandRoi' },
                  { name: 'Eraser' },
                  { name: 'CircleScissors' },
                  { name: 'RectangleScissors' },
                  { name: 'FreehandScissors' },
                  { name: 'Magnify' },
                  { name: 'Pan' },
                  { name: 'Wwwc' },
                  { name: 'PanMultiTouch' },
                  { name: 'ZoomTouchPinch' },
                  { name: 'StackScrollMultiTouch' },
                  { name: 'StackScrollMouseWheel' }
                ]}
                viewportData={this.state.cornerstoneViewportData}
                onMeasurementsChanged={this.onMeasurementsChanged}
                onElementEnabled={this.saveCornerstoneElements(0)}
              />
            )}
          </div> */}
          {/* <div className="col-sm-4">{this.state.activeToolName}</div> */}
        </div>

        <div className="row">
          <div className="col-sm-3">
            <span className="label label-primary">Coronal</span>
            <View2D
              volumes={this.state.volumes}
              onCreated={this.storeApi(0)}
              orientation={{ sliceNormal: [0, 1, 0], viewUp: [0, 0, 1] }}
              paintFilterBackgroundImageData={
                this.state.paintFilterBackgroundImageData
              }
              paintFilterLabelMapImageData={
                this.state.paintFilterLabelMapImageData
              }
              painting={this.state.focusedWidgetId === "PaintWidget"}
            />
          </div>
          <div className="col-sm-3">
            <span className="label label-success">Sagittal</span>
            <View2D
              volumes={this.state.volumes}
              onCreated={this.storeApi(1)}
              orientation={{ sliceNormal: [1, 0, 0], viewUp: [0, 0, 1] }}
              paintFilterBackgroundImageData={
                this.state.paintFilterBackgroundImageData
              }
              paintFilterLabelMapImageData={
                this.state.paintFilterLabelMapImageData
              }
              painting={this.state.focusedWidgetId === "PaintWidget"}
            />
          </div>
          <div className="col-sm-3">
            <span className="label label-danger">Axial</span>
            <View2D
              volumes={this.state.volumes}
              onCreated={this.storeApi(2)}
              orientation={{ sliceNormal: [0, 0, 1], viewUp: [0, -1, 0] }}
              paintFilterBackgroundImageData={
                this.state.paintFilterBackgroundImageData
              }
              paintFilterLabelMapImageData={
                this.state.paintFilterLabelMapImageData
              }
              painting={this.state.focusedWidgetId === "PaintWidget"}
            />
          </div>
          <div className="col-sm-3">
            <span className="label label-warning">3D Volums</span>
            <View3D
              volumes={this.state.volumeRenderingVolumes}
              onCreated={this.saveApiReference}
              paintFilterBackgroundImageData={
                this.state.paintFilterBackgroundImageData
              }
              paintFilterLabelMapImageData={
                this.state.paintFilterLabelMapImageData
              }
              painting={this.state.focusedWidgetId === 'PaintWidget'}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default VTKCrosshairsExample;
