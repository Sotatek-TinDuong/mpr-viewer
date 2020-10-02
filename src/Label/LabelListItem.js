import React, { Component } from 'react';
import { SketchPicker } from 'react-color';
import { PropTypes } from 'prop-types';

export default class LabelListItem extends Component {
  static propTypes = {
    rows: PropTypes.any,
    onDelete: PropTypes.any,
    onChange: PropTypes.any,
  };
  render() {
    var data = this.props;
    if (!data.rows || data.rows.length < 1) {
      return '';
    }
    return data.rows.map(function(d, idx) {
      return (
        <tr key={d.id}>
          <td>{d.id}</td>
          <td className="text-left">
            <input
              className="label-name"
              defaultValue={d.labellist}
              onChange={e => {
                if (e.target.value !== d.labellist) {
                  d.labellist = e.target.value;
                  data.onChange(d);
                }
              }}
            />
          </td>
          <td>
            <input
              className="input-color-picker"
              style={{
                backgroundColor: d.color,
              }}
              readOnly
            />
            <SketchPicker
              color={d.color}
              onChangeComplete={color => {
                if (color.hex !== d.color) {
                  d.color = color.hex;
                  data.onChange(d);
                }
              }}
            />
          </td>
          <td>{d.type}</td>
          <td className="last">
            <button className="remove-label" onClick={() => data.onDelete(d)}>
              <i className="fa fa-home" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      );
    });
  }
}
