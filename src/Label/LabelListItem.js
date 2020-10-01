import React, { Component } from 'react';
import { PropTypes } from 'prop-types';

export default class LabelListItem extends Component {
  static propTypes = {
    rows: PropTypes.any,
  };
  render() {
    var data = this.props.rows;
    if (!data || data.length < 1) {
      return '';
    }
    return data.map(function(d, idx) {
      return (
        <tr key={d.id}>
          <td>
            <button>
              <img src="../images/new-icon/eye-btn-disable.png" alt="" />
            </button>
          </td>
          <td className="text-left">
            <span className="label-name">{d.labellist}</span>
          </td>
          <td>
            <input
              className="input-color-picker"
              style={{
                backgroundColor: d.color,
              }}
              readOnly
            />
          </td>
          <td>{d.type}</td>
          <td className="last">
            <button
              className="remove-label"
              onClick={() => this.removeLabelList()}
            >
              <i className="fa fa-home" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      );
    });
  }
}
