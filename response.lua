local _M = {}
function _M.printReponse(headers)
    -- ngx.say(headers)
    ngx.header.content_type = "text/html"
    local htmlHeader = require "header"
    local getHeader = htmlHeader.showHeader()
    print(getHeader)
    local html =  [[
            <div class="container-fluid">
              <div class="row">
                <nav class="navbar navbar-expand-lg navbar-light bg-light">
                  <div class="container-fluid">
                    <a class="navbar-brand" href="#">Navbar</a>
                    <button
                      class="navbar-toggler"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target="#navbarNavDropdown"
                      aria-controls="navbarNavDropdown"
                      aria-expanded="false"
                      aria-label="Toggle navigation"
                    >
                      <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNavDropdown">
                      <ul class="navbar-nav">
                        <li class="nav-item">
                          <a class="nav-link active" aria-current="page" href="#"
                            >Home</a
                          >
                        </li>
                        <li class="nav-item">
                          <a class="nav-link" href="#">Features</a>
                        </li>
                        <li class="nav-item">
                          <a class="nav-link" href="#">Pricing</a>
                        </li>
                        <li class="nav-item dropdown">
                          <a
                            class="nav-link dropdown-toggle"
                            href="#"
                            id="navbarDropdownMenuLink"
                            role="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                          >
                            Dropdown link
                          </a>
                          <ul
                            class="dropdown-menu"
                            aria-labelledby="navbarDropdownMenuLink"
                          >
                            <li><a class="dropdown-item" href="#">Action</a></li>
                            <li>
                              <a class="dropdown-item" href="#">Another action</a>
                            </li>
                            <li>
                              <a class="dropdown-item one" href="#">Something else here</a>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </div>
                  </div>
                </nav>
              </div>
            </div>
            <script
              src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"
              integrity="sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p"
              crossorigin="anonymous"
            ></script>
          </body>
        </html>
        
    ]]
    ngx.say(html)
    -- comment
end

return _M
