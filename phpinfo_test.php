<?php
echo 'ZipArchive: ' . (class_exists('ZipArchive') ? 'JEST ✅' : 'BRAK ❌') . '<br>';
echo 'DOMDocument: ' . (class_exists('DOMDocument') ? 'JEST ✅' : 'BRAK ❌') . '<br>';
echo 'PHP version: ' . phpversion();