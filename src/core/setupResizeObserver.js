export function setupResizeObserver({ renderer, camera, container = window } = {}) {
  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };

  handleResize();
  container.addEventListener('resize', handleResize);

  return () => container.removeEventListener('resize', handleResize);
}
