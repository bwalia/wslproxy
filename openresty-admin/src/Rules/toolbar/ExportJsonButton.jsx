const ExportJsonButton = (rules) => {
    const jsonData = JSON.stringify(rules);
    // Create a Blob from the JSON data
    const blob = new Blob([jsonData], { type: 'application/json' });
    // Create a URL from the Blob and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rules.json`;
    link.click();
    // Cleanup
    URL.revokeObjectURL(url);
};

export default ExportJsonButton;
