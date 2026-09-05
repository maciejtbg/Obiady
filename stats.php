<?php
// stats.php - Prosty dashboard statystyk
// UWAGA: Zabezpiecz hasłem!

require_once 'db_config.php';

// Prosta autentykacja (zmień hasło!)
$password = '5Kilos'; // ZMIEŃ TO!
$entered = $_POST['password'] ?? $_GET['password'] ?? '';

if ($entered !== $password) {
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Statystyki - Wymagane hasło</title>
        <style>
            body { font-family: Arial; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f0f0; }
            form { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            input { padding: 10px; margin: 10px 0; width: 200px; }
            button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
        </style>
    </head>
    <body>
        <form method="post">
            <h2>🔒 Statystyki</h2>
            <input type="password" name="password" placeholder="Hasło" required>
            <br>
            <button type="submit">Zaloguj</button>
        </form>
    </body>
    </html>
    <?php
    exit;
}

// Dashboard
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Statystyki wizyt</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1, h2 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #007bff; color: white; }
        .stat-box { display: inline-block; padding: 20px; margin: 10px; background: #007bff; color: white; border-radius: 8px; min-width: 150px; text-align: center; }
        .stat-number { font-size: 32px; font-weight: bold; }
        .stat-label { font-size: 14px; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Statystyki wizyt</h1>
        
        <?php
        if (!$conn) {
            echo '<div class="card"><p style="color: red;">Błąd połączenia z bazą danych</p></div>';
            exit;
        }
        
        // Sprawdź czy tabela istnieje
        $tableCheck = $conn->query("SHOW TABLES LIKE 'visit_logs'");
        if ($tableCheck->num_rows === 0) {
            echo '<div class="card"><p style="color: orange;">Tabela visit_logs nie istnieje. Wykonaj SQL z pliku create_visit_logs.sql</p></div>';
            exit;
        }
        
        // Statystyki ogólne
        $totalVisits = $conn->query("SELECT COUNT(*) as cnt FROM visit_logs")->fetch_assoc()['cnt'];
        $todayVisits = $conn->query("SELECT COUNT(*) as cnt FROM visit_logs WHERE DATE(visit_date) = CURDATE()")->fetch_assoc()['cnt'];
        $thisMonthVisits = $conn->query("SELECT COUNT(*) as cnt FROM visit_logs WHERE MONTH(visit_date) = MONTH(CURDATE()) AND YEAR(visit_date) = YEAR(CURDATE())")->fetch_assoc()['cnt'];
        $uniqueIPs = $conn->query("SELECT COUNT(DISTINCT ip_anonymized) as cnt FROM visit_logs WHERE DATE(visit_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)")->fetch_assoc()['cnt'];
        ?>
        
        <div class="card">
            <div class="stat-box">
                <div class="stat-number"><?php echo $totalVisits; ?></div>
                <div class="stat-label">Wszystkich wizyt</div>
            </div>
            <div class="stat-box" style="background: #28a745;">
                <div class="stat-number"><?php echo $todayVisits; ?></div>
                <div class="stat-label">Dzisiaj</div>
            </div>
            <div class="stat-box" style="background: #17a2b8;">
                <div class="stat-number"><?php echo $thisMonthVisits; ?></div>
                <div class="stat-label">W tym miesiącu</div>
            </div>
            <div class="stat-box" style="background: #ffc107; color: #333;">
                <div class="stat-number"><?php echo $uniqueIPs; ?></div>
                <div class="stat-label">Unikalne IP (30 dni)</div>
            </div>
        </div>
        
        <div class="card">
            <h2>Top 10 przeglądarek</h2>
            <table>
                <tr><th>Przeglądarka</th><th>Liczba wizyt</th></tr>
                <?php
                $browsers = $conn->query("SELECT browser, COUNT(*) as cnt FROM visit_logs GROUP BY browser ORDER BY cnt DESC LIMIT 10");
                while ($row = $browsers->fetch_assoc()) {
                    echo "<tr><td>{$row['browser']}</td><td>{$row['cnt']}</td></tr>";
                }
                ?>
            </table>
        </div>
        
        <div class="card">
            <h2>Top 10 systemów operacyjnych</h2>
            <table>
                <tr><th>System</th><th>Liczba wizyt</th></tr>
                <?php
                $os = $conn->query("SELECT os, COUNT(*) as cnt FROM visit_logs GROUP BY os ORDER BY cnt DESC LIMIT 10");
                while ($row = $os->fetch_assoc()) {
                    echo "<tr><td>{$row['os']}</td><td>{$row['cnt']}</td></tr>";
                }
                ?>
            </table>
        </div>
        
        <div class="card">
            <h2>Ostatnie 20 wizyt</h2>
            <table>
                <tr><th>Data</th><th>IP</th><th>Przeglądarka</th><th>OS</th><th>Strona</th></tr>
                <?php
                $recent = $conn->query("SELECT * FROM visit_logs ORDER BY visit_date DESC LIMIT 20");
                while ($row = $recent->fetch_assoc()) {
                    echo "<tr>
                        <td>{$row['visit_date']}</td>
                        <td>{$row['ip_anonymized']}</td>
                        <td>{$row['browser']}</td>
                        <td>{$row['os']}</td>
                        <td>{$row['page']}</td>
                    </tr>";
                }
                ?>
            </table>
        </div>
        <div class="card">
    <h2>🌍 Top 10 miast</h2>
    <table>
        <tr><th>Miasto</th><th>Kraj</th><th>Wizyty</th></tr>
        <?php
        $cities = $conn->query("SELECT city, country, COUNT(*) as cnt FROM visit_logs WHERE city != 'Unknown' GROUP BY city, country ORDER BY cnt DESC LIMIT 10");
        while ($row = $cities->fetch_assoc()) {
            echo "<tr><td>{$row['city']}</td><td>{$row['country']}</td><td>{$row['cnt']}</td></tr>";
        }
        ?>
    </table>
</div>

<div class="card">
    <h2>🌐 Top 10 dostawców internetu (ISP)</h2>
    <table>
        <tr><th>ISP</th><th>Wizyty</th></tr>
        <?php
        $isps = $conn->query("SELECT isp, COUNT(*) as cnt FROM visit_logs WHERE isp != 'Unknown' GROUP BY isp ORDER BY cnt DESC LIMIT 10");
        while ($row = $isps->fetch_assoc()) {
            echo "<tr><td>{$row['isp']}</td><td>{$row['cnt']}</td></tr>";
        }
        ?>
    </table>
</div>

<div class="card">
    <h2>📱 Typy urządzeń</h2>
    <table>
        <tr><th>Urządzenie</th><th>Wizyty</th><th>%</th></tr>
        <?php
        $devices = $conn->query("SELECT device_type, COUNT(*) as cnt, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM visit_logs), 1) as percent FROM visit_logs GROUP BY device_type ORDER BY cnt DESC");
        while ($row = $devices->fetch_assoc()) {
            echo "<tr><td>{$row['device_type']}</td><td>{$row['cnt']}</td><td>{$row['percent']}%</td></tr>";
        }
        ?>
    </table>
</div>

<div class="card">
    <h2>⏱️ Średni czas na stronie</h2>
    <?php
    $avgTime = $conn->query("SELECT AVG(time_on_page) as avg FROM visit_logs WHERE time_on_page > 0")->fetch_assoc()['avg'];
    $avgTime = round($avgTime);
    $minutes = floor($avgTime / 60);
    $seconds = $avgTime % 60;
    ?>
    <div class="stat-box">
        <div class="stat-number"><?php echo $minutes; ?>m <?php echo $seconds; ?>s</div>
        <div class="stat-label">Średni czas na stronie</div>
    </div>
</div>
        
        <div class="card">
            <p style="color: #666; font-size: 12px;">
                ℹ️ Adresy IP są anonimizowane (ostatni oktet zastąpiony zerem) zgodnie z RODO.<br>
                Logi starsze niż 90 dni powinny być automatycznie usuwane.
            </p>
        </div>
    </div>
</body>
</html>
<?php
$conn->close();
?>