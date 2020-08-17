import React from 'react';
import { Component } from 'react';

class DrawToolsExample extends Component {
  constructor(props) {
    super(props);

    this.state = {
      count: 0,
      sengments: [
        { name: 'segment 1', editing: false },
        { name: 'segment 1', editing: false },
        { name: 'segment 2', editing: false },
        { name: 'segment 3', editing: false },
        { name: 'segment 4', editing: false },
        { name: 'segment 5', editing: false }
      ]
    }
  }
  componentDidMount() {
    console.log("componentDidMount");
  }

  handleClick = () => {

    this.setState({ count: this.state.count + 2 })
  }
  addSegment = () => {
    var index = this.state.sengments.length + 1;
    this.state.sengments.push(index);
    this.setState({ sengments: this.state.sengments });
  }
  removeSegment = (idx) => {
    this.state.sengments.splice(idx, 1);
    this.setState({ sengments: this.state.sengments });
  }
  editSegmentName = (labelname, idx) => {
    labelname.editing = true;
    this.setState({ sengments: this.state.sengments });
    setTimeout(() => {
      $(input).focus()
    }, 500);
  }
  handleBlur = (item, event) => {
    item.editing = false;
    item.name = event.target.value;
    this.setState({ sengments: this.state.sengments });
  }

  render() {
    return (
      <div className="panel3D">
        <div className="mpr-label-lst">
          <div className="mpr-label-lst__lbl arrow-anim">
            <img src="../images/new-icon/lbl-list.png" /> <span>Label List</span>
          </div>
        </div>
        <div className="mpr-label-lst__content collapse in">
          <div className="mpr-label-lst__content--btns">
            <button className="btn btn-light" onClick={() => { this.addSegment() }}>
              <img src="../images/new-icon/add-btn-3d.svg" /> Add
              </button>
            <button className="btn btn-light"><img src="../images/new-icon/minus-btn-3d.svg" /> Remove</button>
            <button className="btn btn-light"><img src="../images/new-icon/save-btn-3d.svg" /> Save</button>
          </div>
          <div className="able mpr-label-lst__content--tbl-wrapper scroll-bar-bbox">
            <table className="table mpr-label-lst__content--tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Color</th>
                </tr>
              </thead>
              <tbody>
                {
                  this.state.sengments.map((item, idx) => {
                    return <tr key={idx}>
                      <td><img src="../images/new-icon/eye-btn-active.png" className="img" /></td>
                      <td onDoubleClick={() => { this.editSegmentName(item, idx) }}>
                        <span className={item.editing ? 'hide' : 'show'}>{item.name}</span>
                        <input className="input-label-name" class={item.editing ? 'show' : 'hide'} type="text" defaultValue={item.name}
                          onBlur={() => { this.handleBlur(item, event) }} />
                      </td>
                      <td><span className="square green"></span> <img onClick={() => { this.removeSegment(idx) }} src="../images/worklist/delete.png" className="w8 un_ver" /></td>
                    </tr>
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
        <div className="mpr-display">
          <div className="mpr-2d-segment">
            <div className="mpr-volumn-visual__ttl arrow-anim" data-toggle="collapse" data-target="#js-2dsegment-ctn">
              <img src="/images/new-icon/2d-segment.png" alt="" />
              <span>2D Segmentation</span>
            </div>
            <div className="collapse in" id="js-2dsegment-ctn">
              <div className="mpr-display__func mpr-2d">
                <button className="mpr-display__func--item" title="MPR scroll">
                  <img src="/images/new-icon/plus-outside.png" />
                </button>
                <button className="mpr-display__func--item" title="Rotate">
                  <img src="/images/new-icon/circle-minus.png" />
                </button>
                <button className="mpr-display__func--item" title="Zoom">
                  <img src="/images/new-icon/brush.png" />
                </button>
                <button className="mpr-display__func--item" title="Pan">
                  <img src="/images/new-icon/eraser.png" />
                </button>
                <button className="mpr-display__func--item" title="Reset image">
                  <img src="/images/new-icon/paint.png" />
                </button>
                <button className="mpr-display__func--item" title="Windowing">
                  <img src="/images/new-icon/recyclebin.png" />
                </button>
                <button className="mpr-display__func--item" title="Reset image">
                  <img src="/images/new-icon/pen.png" />
                </button>
                <button className="mpr-display__func--item" title="Reset image">
                  <img src="/images/new-icon/cube.png" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="mpr-display">
          <div className="mpr-2d-segment label-panel">
            <div className="mpr-volumn-visual__ttl arrow-anim">
              <img src="../images/new-icon/annotation_list.svg" className="w16" />
              <span>Annotation List</span>
            </div>
            <div className="box-content">
              <div className="button-list">
                <button className="w-50">
                  <img src="../images/new-icon/open-file-bbox.svg" /> Open
                </button>
              </div>
              <div className="table-wrap-anno">
                <table className="label-list-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Color</th>
                      <th>Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="mpr-display">
          <div className="mpr-2d-segment label-panel">
            <div className="mpr-volumn-visual__ttl arrow-anim">
              <img src="../images/new-icon/download.svg" className="w16" />
              <span>Download</span>
            </div>
            <div className="box-content collapse in">
              <div className="button-list no-border-bottom">
                <button className="w-50">
                  <img src="../images/new-icon/save-btn-3d.svg" /> VOC
                </button>
                <button className="w-50">
                  <img src="../images/new-icon/save-btn-3d.svg" /> CROP
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default DrawToolsExample;
