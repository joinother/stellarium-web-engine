(function () {
  var b = document.getElementById('mirror-badge');
  if (!b) return;
  var x = document.getElementById('mirror-badge-x');
  var t = setTimeout(function () { b.classList.add('hide'); }, 12000);
  function close() { clearTimeout(t); b.classList.add('hide'); }
  if (x) x.addEventListener('click', function (e) { e.stopPropagation(); close(); });
  console.log('%cStellarium Web 国内镜像站 %c 星表数据本地托管',
    'color:#8fc0ff;font-weight:bold', 'color:#8899aa');
})();
