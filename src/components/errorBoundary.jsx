import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Error Boundary caught:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <h2>⚠️ Map Loading Error</h2>
                    <p>Something went wrong with the map component. Please:</p>
                    <ul>
                        <li>Refresh the page</li>
                        <li>Check your internet connection</li>
                        <li>Try a different location</li>
                    </ul>
                </div>
            );
        }
        return this.props.children;
    }
}