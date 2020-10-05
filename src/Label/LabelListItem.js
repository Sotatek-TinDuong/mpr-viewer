import React, { Component } from 'react';
import { SketchPicker } from 'react-color';
import { PropTypes } from 'prop-types';

class LabelListItem extends Component {
  constructor(props) {
    super(props);
    this.state = {
      indexActive: null,
    };
  }
  static propTypes = {
    rows: PropTypes.any,
    onDelete: PropTypes.any,
    onChange: PropTypes.any,
  };
  render() {
    var data = this.props;
    if (!data.rows || data.rows.length < 1) {
      return null;
    }
    var self = this;
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
              onClick={() => {
                self.setState({
                  indexActive: idx,
                });
              }}
              readOnly
            />
            {self.state.indexActive === idx ? (
              <div className="sketch-picker-container">
                <SketchPicker
                  color={row.color}
                  onChangeComplete={color => {
                    if (color.hex !== row.color) {
                      row.color = color.hex;
                      data.onChange(row);
                    }
                    self.setState({
                      indexActive: null,
                    });
                  }}
                />
              </div>
            ) : null}
          </td>
          <td>{row.type}</td>
          <td className="last">
            <button className="remove-label" onClick={() => data.onDelete(row)}>
              <i className="fa fa-home" aria-hidden="true" />
            </button>
          </td>
        </tr>
      );
    });
  }
}

export default LabelListItem;
