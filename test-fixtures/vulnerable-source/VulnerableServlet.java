# Vulnerable Java servlet for testing ctf-artifact-analyze
import java.io.*;
import javax.servlet.*;
import javax.servlet.http.*;
import java.sql.*;

public class VulnerableServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String id = req.getParameter("id");
        String query = "SELECT * FROM users WHERE id = " + id;  // Sink: sqli

        try {
            Statement stmt = DriverManager.getConnection("jdbc:mysql://localhost/db").createStatement();
            ResultSet rs = stmt.executeQuery(query);
        } catch (SQLException e) { }

        String cmd = req.getParameter("cmd");
        Runtime.getRuntime().exec(cmd);  // Sink: command_injection

        String filename = req.getParameter("file");
        File f = new File(filename);  // Sink: path_traversal
        FileReader fr = new FileReader(f);

        String data = req.getParameter("data");
        ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(data.getBytes()));
        try {
            Object obj = ois.readObject();  // Sink: deser
        } catch (ClassNotFoundException e) { }
    }
}
