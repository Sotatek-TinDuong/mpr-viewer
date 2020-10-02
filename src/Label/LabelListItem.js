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
    return data.rows.map(function(row, idx) {
      return (
        <tr key={row.id}>
          <td>{row.id}</td>
          <td className="text-left">
            <input
              className="label-name"
              defaultValue={row.labellist}
              onChange={e => {
                if (e.target.value !== row.labellist) {
                  row.labellist = e.target.value;
                  data.onChange(row);
                }
              }}
            />
          </td>
          <td>
            <input
              className="input-color-picker"
              style={{
                backgroundColor: row.color,
              }}
              readOnly
            />
            <SketchPicker
              color={row.color}
              onChangeComplete={color => {
                if (color.hex !== row.color) {
                  row.color = color.hex;
                  data.onChange(row);
                }
              }}
            />
          </td>
          <td>{row.type}</td>
          <td className="last">
            <button className="remove-label" onClick={() => data.onDelete(row)}>
              <i className="fa fa-home" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      );
    });
  }
}
