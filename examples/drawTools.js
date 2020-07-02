import React from 'react';
import { Component } from 'react';

class DrawToolsExample extends Component {
  constructor(props) {
    super(props);

    this.state = {
      count: 0
    }
  }

  componentDidMount() {
    console.log("componentDidMount");
  }

  handleClick = () => {
    this.setState({ count: this.state.count + 1 })
  }

  render() {
    return (
      <div>
        <div className="main-tool">
          <button onClick={() => { this.handleClick() }}>Change State</button>
          <h1>Count: {this.state.count}</h1>
        </div>
      </div>
    );
  }
}

export default DrawToolsExample;
